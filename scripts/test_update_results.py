import csv
import hashlib
import json
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

import update_results as updater


def draw_html(day, digits, fireball=""):
    balls = "".join(f'<li class="c-ball c-ball--sm">{n}</li>' for n in digits)
    fb = f'<span class="c-ball c-ball--fire c-ball--sm">{fireball}</span>' if fireball else ""
    return (
        '<tr class="c-results-table__item c-results-table__item--medium c-draw-card">'
        f'<span class="c-draw-card__draw-date-sub">Sep {day}, 2026</span>'
        f'{balls}{fb}<td>Top prize $500</td></tr>'
    )


def m4l_html(day=21):
    balls = "".join(f'<li class="c-ball c-ball--sm">{n}</li>' for n in (2, 14, 28, 37, 42))
    return (
        '<tr class="c-results-table__item c-results-table__item--medium c-draw-card">'
        f'<span class="c-draw-card__draw-date-sub">Sep {day}, 2026</span>'
        f'{balls}<span class="c-ball c-ball--green c-ball--sm">3</span></tr>'
    )


class FakeResponse:
    def __init__(self, body):
        self.body = body.encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        data = Path(self.temp.name) / "data"
        data.mkdir()
        self.csv_path = data / "nj_numbers_canonical.csv"
        self.status_path = data / "feed-status.json"
        with self.csv_path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=updater.CSV_FIELDS)
            writer.writeheader()
            writer.writerow({
                "game": "P3", "date": "2026-09-20", "draw": "MID",
                "digits": "1-2-3", "fireball": "4", "prize_straight": "275",
            })
        self.path_patch = mock.patch.multiple(
            updater, CSV_PATH=self.csv_path, STATUS_PATH=self.status_path
        )
        self.path_patch.start()

    def tearDown(self):
        self.path_patch.stop()
        self.temp.cleanup()

    def source_body(self, url):
        if url == updater.M4L_SOURCE_URL:
            return m4l_html(), 1
        if "midday-pick-3" in url:
            return draw_html(20, "999", "4") + draw_html(21, "007", "5"), 1
        if "pick-3" in url:
            raise RuntimeError("temporary evening outage")
        if "midday-pick-4" in url:
            return draw_html(21, "1234", "6"), 1
        return draw_html(21, "5678", "7"), 1

    def test_partial_failure_saves_valid_rows_status_and_conflicts(self):
        now = datetime(2026, 9, 22, 4, 0, tzinfo=timezone.utc)
        with mock.patch.object(updater, "request_text", side_effect=self.source_body):
            status, exit_code = updater.collect(now)

        self.assertEqual(exit_code, 2)
        self.assertEqual(status["failed_sources"], ["P3_EVE"])
        self.assertEqual(status["rows_before"], 1)
        self.assertEqual(status["rows_added"], 4)
        self.assertEqual(status["conflict_count"], 1)
        self.assertEqual(status["sources"]["P3_MID"]["conflicts"][0]["stored"]["digits"], "1-2-3")

        rows = updater.read_csv(self.csv_path)
        self.assertEqual(rows[0]["prize_straight"], "275")
        self.assertIn(("P3", "2026-09-21", "MID"), {updater.record_key(row) for row in rows})
        self.assertNotIn(("P3", "2026-09-21", "EVE"), {updater.record_key(row) for row in rows})

        written = json.loads(self.status_path.read_text())
        self.assertEqual(written["schema_version"], 1)
        self.assertEqual(written["csv_sha256"], hashlib.sha256(self.csv_path.read_bytes()).hexdigest())
        self.assertEqual(written["newest_dates"]["P3_MID"], "2026-09-21")

    def test_future_record_fails_only_its_source(self):
        def body(url):
            if url == updater.M4L_SOURCE_URL:
                return m4l_html(), 1
            if "midday-pick-3" in url:
                return draw_html(23, "007", "5"), 1
            digits = "123" if "pick-3" in url else "1234"
            return draw_html(21, digits, "2"), 1

        with mock.patch.object(updater, "request_text", side_effect=body):
            status, exit_code = updater.collect(datetime(2026, 9, 22, 12, tzinfo=timezone.utc))
        self.assertEqual(exit_code, 2)
        self.assertFalse(status["sources"]["P3_MID"]["ok"])
        self.assertIn("future draw date", status["sources"]["P3_MID"]["error"])
        self.assertNotIn(("P3", "2026-09-23", "MID"), {updater.record_key(row) for row in updater.read_csv()})

    def test_retries_transient_network_error(self):
        side_effects = [urllib.error.URLError("temporary"), FakeResponse("ok")]
        with mock.patch.object(updater.urllib.request, "urlopen", side_effect=side_effects) as opened:
            body, attempts = updater.request_text("https://example.test", sleep=lambda _: None)
        self.assertEqual(body, "ok")
        self.assertEqual(attempts, 2)
        self.assertEqual(opened.call_count, 2)

    def test_conflicting_duplicate_from_one_source_adds_nothing(self):
        additions = []
        saved = {}
        candidates = [
            updater.make_row("P3", "MID", ("2026-09-21", "0-0-7", "5")),
            updater.make_row("P3", "MID", ("2026-09-21", "1-1-2", "5")),
        ]
        with self.assertRaisesRegex(ValueError, "conflicting duplicate"):
            updater.merge_source_rows(candidates, saved, additions, datetime(2026, 9, 22).date())
        self.assertEqual(additions, [])

    def test_cutoffs_follow_eastern_time_and_grace_period(self):
        self.assertEqual(
            updater.expected_cutoffs(datetime(2026, 9, 22, 3, 0, tzinfo=timezone.utc)),
            {"MID": "2026-09-21", "EVE": "2026-09-20"},
        )
        self.assertEqual(
            updater.expected_cutoffs(datetime(2026, 9, 22, 4, 0, tzinfo=timezone.utc)),
            {"MID": "2026-09-21", "EVE": "2026-09-21"},
        )

    def test_visible_table_ignores_conflicting_copy_widgets(self):
        copied = '<textarea>' + draw_html(21, '999', '0') + '</textarea>'
        script = '<script>' + draw_html(21, '888', '0') + '</script>'
        hidden = '<div hidden>' + draw_html(21, '777', '0') + '</div>'
        self.assertEqual(list(updater.parse_page(copied + script + hidden + draw_html(21, '007', '5'), 3)),
                         [('2026-09-21', '0-0-7', '5')])

    def test_dated_malformed_rows_fail_instead_of_silently_skipping(self):
        for html in [draw_html(21, '12', '5'), draw_html(21, '1234', '5'),
                     draw_html(21, '123', ''), draw_html(21, '123', '10'),
                     draw_html(31, '123', '5'), draw_html(21, '１２３', '5'),
                     draw_html(21, '123', '5').removesuffix('</tr>')]:
            with self.subTest(html=html), self.assertRaises(ValueError):
                list(updater.parse_page(html, 3))

    def test_duplicate_results_are_idempotent_and_old_m4l_labels_match(self):
        old = updater.make_row('M4L', 'EVE', ('2026-09-21', '02-14-28-37-42', '3'))
        incoming = updater.make_row('M4L', '', ('2026-09-21', '2-14-28-37-42', '3'))
        additions = []
        report = updater.merge_source_rows([incoming, incoming], {updater.record_key(old): old}, additions,
                                           datetime(2026, 9, 22).date())
        self.assertEqual(report['added'], 0)
        self.assertEqual(report['conflicts'], [])
        self.assertEqual(old['draw'], 'EVE')

    def test_same_day_future_evening_draw_is_rejected(self):
        now = datetime(2026, 9, 21, 18, tzinfo=timezone.utc)
        candidate = updater.make_row('P3', 'EVE', ('2026-09-21', '1-2-3', '0'))
        with self.assertRaisesRegex(ValueError, 'before drawing time'):
            updater.merge_source_rows([candidate], {}, [], now.date(), updater.expected_cutoffs(now, 0))

    def test_retry_exhaustion_and_permanent_http_errors_are_bounded(self):
        with mock.patch.object(updater.urllib.request, 'urlopen', side_effect=TimeoutError('down')) as opened:
            with self.assertRaisesRegex(RuntimeError, '3 attempt'):
                updater.request_text('https://example.test', sleep=lambda _: None)
            self.assertEqual(opened.call_count, 3)
        error = urllib.error.HTTPError('https://example.test', 404, 'Not found', {}, None)
        with mock.patch.object(updater.urllib.request, 'urlopen', side_effect=error) as opened:
            with self.assertRaisesRegex(RuntimeError, '1 attempt'):
                updater.request_text('https://example.test', sleep=lambda _: None)
            self.assertEqual(opened.call_count, 1)

    def test_all_sources_unavailable_keeps_csv_byte_identical_and_writes_status(self):
        before = self.csv_path.read_bytes()
        with mock.patch.object(updater, 'request_text', side_effect=RuntimeError('offline')):
            status, code = updater.collect(datetime(2026, 9, 22, 12, tzinfo=timezone.utc))
        self.assertEqual(code, 2)
        self.assertEqual(self.csv_path.read_bytes(), before)
        self.assertEqual(len(status['failed_sources']), 5)
        self.assertEqual(status['rows_added'], 0)
        self.assertTrue(self.status_path.exists())

    def test_recent_gaps_and_winter_cutoffs(self):
        now = datetime(2026, 9, 21, 19, tzinfo=timezone.utc)
        rows = [updater.make_row('P3', 'MID', ('2026-09-21', '0-0-7', '0')),
                updater.make_row('P3', 'EVE', ('2026-09-20', '1-2-3', '0'))]
        self.assertEqual(updater.recent_missing(rows, now, 2),
                         {'MID': ['2026-09-20'], 'EVE': ['2026-09-19']})
        self.assertEqual(updater.expected_cutoffs(datetime(2026, 1, 10, 18, 19, tzinfo=timezone.utc)),
                         {'MID': '2026-01-10', 'EVE': '2026-01-09'})

    def test_failed_atomic_replacement_preserves_original(self):
        before = self.csv_path.read_bytes()
        with mock.patch.object(updater.os, 'replace', side_effect=OSError('disk error')):
            with self.assertRaises(OSError):
                updater.atomic_write_csv([], self.csv_path)
        self.assertEqual(self.csv_path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
