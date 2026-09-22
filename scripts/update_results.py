#!/usr/bin/env python3
"""Resilient NJ lottery results collector.

The canonical CSV is append-only. Each source is fetched and validated
independently, conflicts are reported instead of overwriting saved history,
and both output files are replaced atomically. A partial source failure exits
with status 2 after saving valid results and feed-status.json so the workflow
can commit useful updates before reporting the failure.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from html.parser import HTMLParser
from typing import Callable, Iterable
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "nj_numbers_canonical.csv"
STATUS_PATH = ROOT / "data" / "feed-status.json"
CSV_FIELDS = ["game", "date", "draw", "digits", "fireball", "prize_straight"]
EASTERN = ZoneInfo("America/New_York")
SCHEMA_VERSION = 1

SOURCES = [
    ("P3_MID", "P3", "MID", 3, "https://www.lotteryusa.com/new-jersey/midday-pick-3/year"),
    ("P3_EVE", "P3", "EVE", 3, "https://www.lotteryusa.com/new-jersey/pick-3/year"),
    ("P4_MID", "P4", "MID", 4, "https://www.lotteryusa.com/new-jersey/midday-pick-4/year"),
    ("P4_EVE", "P4", "EVE", 4, "https://www.lotteryusa.com/new-jersey/pick-4/year"),
]
M4L_SOURCE_ID = "M4L"
M4L_SOURCE_URL = "https://www.lotteryusa.com/new-jersey/millionaire-for-life/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}
MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def request_text(
    url: str,
    attempts: int = 3,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[str, int]:
    """Fetch a source with bounded retries and return (body, attempts_used)."""
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.read().decode("utf-8", errors="replace"), attempt
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        if attempt < attempts:
            sleep(2 ** (attempt - 1))
    raise RuntimeError(f"fetch failed after {attempt} attempt(s): {last_error}") from last_error


class ResultTableParser(HTMLParser):
    """Read dated result-table rows only; never use copy/export widgets."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.stack = []
        self.row = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set(attrs.get("class", "").split())
        ignored = (
            (self.stack and self.stack[-1][1])
            or tag in {"script", "style", "textarea", "template"}
            or "hidden" in attrs or attrs.get("aria-hidden") == "true"
            or bool(re.search(r"display\s*:\s*none|visibility\s*:\s*hidden", attrs.get("style", ""), re.I))
        )
        capture = self.stack[-1][2] if self.stack else None
        if not ignored:
            if tag == "tr" and "c-draw-card" in classes:
                if self.row is not None:
                    raise ValueError("nested result row")
                self.row = {"dates": [], "balls": [], "bonus": []}
            if self.row is not None:
                field = None
                if "c-draw-card__draw-date-sub" in classes:
                    field = "dates"
                elif "c-ball" in classes:
                    if "c-ball--fire" in classes or "c-ball--green" in classes:
                        field = "bonus"
                    elif tag == "li":
                        field = "balls"
                if field:
                    self.row[field].append("")
                    capture = (field, len(self.row[field]) - 1)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append((tag, ignored, capture))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data):
        if self.row is not None and self.stack and not self.stack[-1][1]:
            capture = self.stack[-1][2]
            if capture:
                field, index = capture
                self.row[field][index] += data

    def handle_endtag(self, tag):
        matching = next((i for i in range(len(self.stack) - 1, -1, -1) if self.stack[i][0] == tag), None)
        if matching is None:
            return
        ignored = self.stack[matching][1]
        if tag == "tr" and self.row is not None and not ignored:
            self.rows.append(self.row)
            self.row = None
        del self.stack[matching:]


def parse_result_rows(html: str, n_digits: int | None = None) -> Iterable[tuple[str, str, str]]:
    parser = ResultTableParser()
    parser.feed(html)
    parser.close()
    if parser.row is not None:
        raise ValueError("truncated result-table row")
    if not parser.rows:
        raise ValueError("no result-table rows found; page markup may have changed")
    for row in parser.rows:
        if not row["dates"] and not row["balls"]:  # advertisement row
            continue
        if len(row["dates"]) != 1:
            raise ValueError("missing or ambiguous result date")
        value = row["dates"][0].strip()
        match = re.fullmatch(r"([A-Za-z]+)\.?\s+([0-9]{1,2}),\s*([0-9]{4})", value)
        if not match or match[1].lower()[:3] not in MONTHS:
            raise ValueError(f"invalid result date {value!r}")
        draw_date = date(int(match[3]), MONTHS[match[1].lower()[:3]], int(match[2])).isoformat()
        balls = [ball.strip() for ball in row["balls"]]
        bonus = [ball.strip() for ball in row["bonus"]]
        if len(bonus) != 1 or not re.fullmatch(r"[0-9]", bonus[0]):
            raise ValueError(f"missing or malformed bonus on {draw_date}")
        if n_digits is not None:
            if len(balls) != n_digits or any(not re.fullmatch(r"[0-9]", ball) for ball in balls):
                raise ValueError(f"malformed Pick {n_digits} digits on {draw_date}")
        else:
            if len(balls) != 5 or any(not re.fullmatch(r"[0-9]{1,2}", ball) for ball in balls):
                raise ValueError(f"malformed M4L numbers on {draw_date}")
            numbers = sorted(map(int, balls))
            if len(set(numbers)) != 5 or not all(1 <= n <= 58 for n in numbers) or not 1 <= int(bonus[0]) <= 5:
                raise ValueError(f"malformed M4L draw on {draw_date}")
            balls = list(map(str, numbers))
        yield draw_date, "-".join(balls), bonus[0]


def parse_page(html: str, n_digits: int) -> Iterable[tuple[str, str, str]]:
    return parse_result_rows(html, n_digits)


def parse_m4l_draws(html: str) -> Iterable[tuple[str, str, str]]:
    return parse_result_rows(html)


def validate_record(row: dict[str, str], today: date) -> None:
    try:
        draw_date = date.fromisoformat(row["date"])
    except (KeyError, ValueError) as exc:
        raise ValueError("invalid ISO draw date") from exc
    if draw_date > today:
        raise ValueError(f"future draw date {draw_date}")
    game, draw, digits, fireball = row["game"], row["draw"], row["digits"], row["fireball"]
    if game in {"P3", "P4"}:
        size = 3 if game == "P3" else 4
        if draw not in {"MID", "EVE"}:
            raise ValueError(f"invalid {game} draw type")
        if not re.fullmatch(r"[0-9](?:-[0-9]){%d}" % (size - 1), digits):
            raise ValueError(f"invalid {game} digits")
        if fireball and not re.fullmatch(r"[0-9]", fireball):
            raise ValueError(f"invalid {game} Fireball")
    elif game == "M4L":
        if draw:
            raise ValueError("M4L draw type must be blank")
        numbers = [int(value) for value in digits.split("-")]
        if len(numbers) != 5 or len(set(numbers)) != 5 or not all(1 <= number <= 58 for number in numbers):
            raise ValueError("invalid M4L numbers")
        if not re.fullmatch(r"[1-5]", fireball):
            raise ValueError("invalid Millionaire Ball")
    else:
        raise ValueError(f"unsupported game {game!r}")


def read_csv(path: Path | None = None) -> list[dict[str, str]]:
    path = path or CSV_PATH
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != CSV_FIELDS:
            raise ValueError(f"unexpected CSV header: {reader.fieldnames}")
        rows = list(reader)
        if any(None in row or any(row.get(field) is None for field in CSV_FIELDS) for row in rows):
            raise ValueError("malformed existing CSV row; refusing to rewrite saved history")
        return rows


def record_key(row: dict[str, str]) -> tuple[str, str, str]:
    # Older M4L imports label the nightly drawing EVE. Keep their bytes, but
    # recognize the same drawing when the feed uses its current blank label.
    return row["game"], row["date"], "" if row["game"] == "M4L" else row["draw"]


def result_value(row: dict[str, str]) -> tuple[str, str]:
    digits = row["digits"]
    if row["game"] == "M4L":
        digits = "-".join(map(str, sorted(map(int, digits.split("-")))))
    return digits, row["fireball"]


def atomic_write_csv(rows: list[dict[str, str]], path: Path | None = None) -> None:
    path = path or CSV_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", newline="", encoding="utf-8", dir=path.parent, delete=False) as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


def atomic_write_json(value: dict, path: Path | None = None) -> None:
    path = path or STATUS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


def expected_cutoffs(now: datetime, grace_minutes: int = 20) -> dict[str, str]:
    local = now.astimezone(EASTERN)
    today, yesterday = local.date(), local.date() - timedelta(days=1)
    minute = local.hour * 60 + local.minute
    return {
        "MID": (today if minute >= 12 * 60 + 59 + grace_minutes else yesterday).isoformat(),
        "EVE": (today if minute >= 22 * 60 + 57 + grace_minutes else yesterday).isoformat(),
    }


def recent_missing(rows: list[dict[str, str]], now: datetime, days: int = 30) -> dict[str, list[str]]:
    cutoffs = expected_cutoffs(now)
    known = {(row["date"], row["draw"]) for row in rows if row["game"] == "P3"}
    result: dict[str, list[str]] = {"MID": [], "EVE": []}
    for draw in ("MID", "EVE"):
        end = date.fromisoformat(cutoffs[draw])
        for offset in range(days - 1, -1, -1):
            value = (end - timedelta(days=offset)).isoformat()
            if (value, draw) not in known:
                result[draw].append(value)
    return result


def newest_dates(rows: list[dict[str, str]]) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for game, draw in (("P3", "MID"), ("P3", "EVE"), ("P4", "MID"), ("P4", "EVE"), ("M4L", "")):
        dates = [row["date"] for row in rows if row["game"] == game and (game == "M4L" or row["draw"] == draw)]
        result[f"{game}_{draw}".rstrip("_")] = max(dates) if dates else None
    return result


def make_row(game: str, draw: str, parsed: tuple[str, str, str]) -> dict[str, str]:
    draw_date, digits, fireball = parsed
    return {
        "game": game,
        "date": draw_date,
        "draw": draw,
        "digits": digits,
        "fireball": fireball,
        "prize_straight": "",
    }


def merge_source_rows(
    candidates: Iterable[dict[str, str]],
    saved_by_key: dict[tuple[str, str, str], dict[str, str]],
    additions: list[dict[str, str]],
    today: date,
    latest_allowed: dict[str, str] | None = None,
) -> dict:
    report = {"ok": True, "records_seen": 0, "added": 0, "conflicts": []}
    incoming: dict[tuple[str, str, str], dict[str, str]] = {}
    for candidate in candidates:
        validate_record(candidate, today)
        if latest_allowed and candidate["game"] in {"P3", "P4"} and candidate["date"] > latest_allowed[candidate["draw"]]:
            raise ValueError(f"future {candidate['draw']} draw {candidate['date']} before drawing time")
        report["records_seen"] += 1
        key = record_key(candidate)
        prior = incoming.get(key)
        if prior and result_value(prior) != result_value(candidate):
            raise ValueError(f"source returned conflicting duplicate {key}")
        incoming[key] = candidate
    if not incoming:
        raise ValueError("parsed zero valid draws")

    for key, candidate in incoming.items():
        saved = saved_by_key.get(key)
        if saved:
            if result_value(saved) != result_value(candidate):
                report["conflicts"].append({
                    "game": key[0], "date": key[1], "draw": key[2],
                    "stored": {"digits": saved["digits"], "fireball": saved["fireball"]},
                    "incoming": {"digits": candidate["digits"], "fireball": candidate["fireball"]},
                })
            continue
        additions.append(candidate)
        saved_by_key[key] = candidate
        report["added"] += 1
    report["newest_date"] = max(row["date"] for row in incoming.values())
    return report


def collect(now: datetime | None = None) -> tuple[dict, int]:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"{CSV_PATH} not found")
    checked_at = now or utc_now()
    today = checked_at.astimezone(EASTERN).date()
    saved_rows = read_csv()
    saved_by_key = {record_key(row): row for row in saved_rows}
    additions: list[dict[str, str]] = []
    source_reports: dict[str, dict] = {}

    for source_id, game, draw, digit_count, url in SOURCES:
        try:
            html, attempts = request_text(url)
            candidates = (make_row(game, draw, item) for item in parse_page(html, digit_count))
            report = merge_source_rows(candidates, saved_by_key, additions, today, expected_cutoffs(checked_at, 0))
            report.update({"url": url, "attempts": attempts})
        except Exception as exc:
            report = {"ok": False, "url": url, "error": str(exc), "records_seen": 0, "added": 0, "conflicts": []}
        source_reports[source_id] = report

    try:
        html, attempts = request_text(M4L_SOURCE_URL)
        candidates = (make_row("M4L", "", item) for item in parse_m4l_draws(html))
        report = merge_source_rows(candidates, saved_by_key, additions, today)
        report.update({"url": M4L_SOURCE_URL, "attempts": attempts})
    except Exception as exc:
        report = {"ok": False, "url": M4L_SOURCE_URL, "error": str(exc), "records_seen": 0, "added": 0, "conflicts": []}
    source_reports[M4L_SOURCE_ID] = report

    additions.sort(key=lambda row: (row["date"], 0 if row["draw"] == "MID" else 1, row["game"]))
    combined = saved_rows + additions
    if additions:
        atomic_write_csv(combined)

    failures = [source_id for source_id, report in source_reports.items() if not report["ok"]]
    conflicts = sum(len(report["conflicts"]) for report in source_reports.values())
    status = {
        "schema_version": SCHEMA_VERSION,
        "checked_at": checked_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "ok": not failures,
        "partial_failure": bool(failures),
        "failed_sources": failures,
        "rows_before": len(saved_rows),
        "rows_after": len(combined),
        "rows_added": len(additions),
        "conflict_count": conflicts,
        "newest_dates": newest_dates(combined),
        "expected_through": expected_cutoffs(checked_at),
        "recent_missing": recent_missing(combined, checked_at),
        "csv_sha256": hashlib.sha256(CSV_PATH.read_bytes()).hexdigest(),
        "sources": source_reports,
    }
    atomic_write_json(status)
    return status, 2 if failures else 0


def main() -> int:
    try:
        status, exit_code = collect()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("status_written=true\n")
    print(
        f"Checked {len(status['sources'])} sources; added {status['rows_added']} row(s); "
        f"found {status['conflict_count']} conflict(s)."
    )
    if status["failed_sources"]:
        print("Partial failure: " + ", ".join(status["failed_sources"]), file=sys.stderr)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
