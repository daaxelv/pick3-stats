#!/usr/bin/env python3
"""
Daily NJ lottery results updater — Pick 3, Pick 4, and Millionaire for Life.

Sources:
  Pick 3 / Pick 4: LotteryUSA archive pages (the official njlottery.com API
    blocks GitHub Actions with HTTP 403, verified Jul 2026).
  Millionaire for Life: LotteryUSA NJ M4L results page (no NJ Lottery API
    endpoint exists for this game yet — too new at launch, Feb 22 2026).

Each LotteryUSA archive page lists roughly the last year of draws, so the
first run also backfills recent history. Requests are minimal: 4 P3/P4 pages
+ 1 M4L page, twice a day.

Safety rules unchanged: append-only, every digit/number validated, fails
loudly rather than writing junk. Results are unofficial — the app already
tells users to verify with the official NJ Lottery.

NOTE FOR M4L MARKUP: If LotteryUSA changes the M4L page structure, update
the regexes in parse_m4l_draws() or switch M4L_SOURCE_URL to the official
NJ Lottery API once one exists.
"""

import csv
import re
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "nj_numbers_canonical.csv"

SOURCES = [
    # (game_code, draw_type, n_digits, url)
    ("P3", "MID", 3, "https://www.lotteryusa.com/new-jersey/midday-pick-3/year"),
    ("P3", "EVE", 3, "https://www.lotteryusa.com/new-jersey/pick-3/year"),
    ("P4", "MID", 4, "https://www.lotteryusa.com/new-jersey/midday-pick-4/year"),
    ("P4", "EVE", 4, "https://www.lotteryusa.com/new-jersey/pick-4/year"),
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

DATE_RE = re.compile(
    r"(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*,\s*"
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+"
    r"(\d{1,2})\s*,\s*(\d{4})",
    re.IGNORECASE,
)

# --- Millionaire for Life (M4L) ---
# 5 numbers from 1-58 (no repeats) + Millionaire Ball 1-5, drawn nightly.
M4L_GAME_CODE = "M4L"
M4L_SOURCE_URL = "https://www.lotteryusa.com/new-jersey/millionaire-for-life/"

M4L_DRAW_BLOCK_RE = re.compile(
    r'<tr class="c-results-table__item c-results-table__item--medium c-draw-card">(.*?)</tr>',
    re.S,
)
M4L_DATE_RE = re.compile(r'c-draw-card__draw-date-sub">\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*<')
M4L_BALL_RE = re.compile(r'class="c-ball c-ball--sm">(\d{1,2})</li>')
M4L_BONUS_RE = re.compile(r'c-ball--green c-ball--sm">(\d)</span>')


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    # strip tags/scripts so we can parse plain text
    html = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style.*?</style>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text)


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_page(text: str, n_digits: int):
    """Yield (date_iso, digits_dashed, fireball) from a results page."""
    matches = list(DATE_RE.finditer(text))
    for i, m in enumerate(matches):
        mon = MONTHS[m.group(1).lower()[:3]]
        day, year = int(m.group(2)), int(m.group(3))
        try:
            date_iso = datetime(year, mon, day).date().isoformat()
        except ValueError:
            continue
        end = matches[i + 1].start() if i + 1 < len(matches) else min(len(text), m.end() + 400)
        chunk = text[m.end():end]
        # keep only what's before the prize amount, so prize digits don't leak in
        chunk = re.split(r"Top\s+prize", chunk, flags=re.I)[0]
        # split off the fireball
        fb = ""
        fb_split = re.split(r"\bFB\b|\bFireball\b", chunk, maxsplit=1, flags=re.I)
        main_part = fb_split[0]
        if len(fb_split) > 1:
            fb_digits = re.findall(r"\d", fb_split[1])
            if fb_digits:
                fb = fb_digits[0]
        digits = re.findall(r"\d", main_part)
        if len(digits) != n_digits:
            continue  # month headers, ads, or malformed rows land here
        yield date_iso, "-".join(digits), fb


def parse_m4l_draws(html: str):
    """Yield (date_iso, digits_dashed, millionaire_ball) from the LotteryUSA
    Millionaire for Life results page.

    digits_dashed: 5 winning numbers 1-58 (ascending, dash-separated).
    millionaire_ball: single digit string 1-5.
    """
    blocks = M4L_DRAW_BLOCK_RE.findall(html)
    if not blocks:
        raise ValueError(
            "No Millionaire for Life draw rows found — LotteryUSA page markup "
            "may have changed; update M4L_DRAW_BLOCK_RE."
        )
    for block in blocks:
        date_m = M4L_DATE_RE.search(block)
        if not date_m:
            continue
        try:
            date_iso = datetime.strptime(date_m.group(1), "%b %d, %Y").date().isoformat()
        except ValueError:
            continue

        balls = M4L_BALL_RE.findall(block)
        bonus_m = M4L_BONUS_RE.search(block)
        if len(balls) != 5 or not bonus_m:
            # Ad slots and other non-draw rows share the same <tr> class; skip.
            continue

        numbers = sorted(int(b) for b in balls)
        mb = int(bonus_m.group(1))
        if (
            len(set(numbers)) != 5
            or not all(1 <= n <= 58 for n in numbers)
            or not (1 <= mb <= 5)
        ):
            raise ValueError(
                f"Malformed Millionaire for Life draw on {date_iso}: "
                f"numbers={balls} MB={bonus_m.group(1)}"
            )

        yield date_iso, "-".join(str(n) for n in numbers), str(mb)


def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found", file=sys.stderr)
        return 1

    existing = set()
    with open(CSV_PATH, newline="") as f:
        reader = csv.reader(f)
        next(reader)  # header
        for row in reader:
            if len(row) >= 3:
                existing.add((row[0], row[1], row[2]))

    new_rows, total_seen = [], 0
    for code, draw_type, n_digits, url in SOURCES:
        try:
            text = fetch_text(url)
        except Exception as exc:
            print(f"ERROR fetching {code} {draw_type}: {exc}", file=sys.stderr)
            return 1
        found = list(parse_page(text, n_digits))
        if not found:
            print(f"ERROR: parsed zero draws for {code} {draw_type} — "
                  f"page format may have changed", file=sys.stderr)
            return 1
        total_seen += len(found)
        for date_iso, digits, fb in found:
            key = (code, date_iso, draw_type)
            if key not in existing:
                new_rows.append([code, date_iso, draw_type, digits, fb, ""])
                existing.add(key)

    # Millionaire for Life: nightly draw, no MID/EVE split (draw field left
    # blank so the (game, date, draw) dedup key is consistent across runs).
    try:
        m4l_html = fetch_html(M4L_SOURCE_URL)
    except Exception as exc:
        print(f"ERROR fetching Millionaire for Life: {exc}", file=sys.stderr)
        return 1
    try:
        m4l_draws = list(parse_m4l_draws(m4l_html))
    except Exception as exc:
        print(f"ERROR parsing Millionaire for Life: {exc}", file=sys.stderr)
        return 1
    for date_iso, digits, mb in m4l_draws:
        key = (M4L_GAME_CODE, date_iso, "")
        if key not in existing:
            new_rows.append([M4L_GAME_CODE, date_iso, "", digits, mb, ""])
            existing.add(key)

    if not new_rows:
        print(f"Checked {total_seen} draws — already up to date.")
        return 0

    new_rows.sort(key=lambda r: (r[0], r[1], r[2]))
    with open(CSV_PATH, "a", newline="") as f:
        csv.writer(f).writerows(new_rows)

    for r in new_rows[:15]:
        print(f"Added: {r[0]} {r[1]} {r[2]} {r[3]}" + (f" FB:{r[4]}" if r[4] else ""))
    if len(new_rows) > 15:
        print(f"...and {len(new_rows) - 15} more")
    print(f"{len(new_rows)} new draw(s) appended.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
