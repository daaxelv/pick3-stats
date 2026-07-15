#!/usr/bin/env python3
"""
Daily NJ lottery results updater — Pick 3 & Pick 4, midday & evening.

Source: LotteryUSA's NJ results archive pages (the official njlottery.com
API blocks requests from GitHub's servers with HTTP 403, verified Jul 2026).
Each archive page lists roughly the last year of draws, so the first run
also backfills recent history. Requests are minimal: 4 pages, twice a day.

Safety rules unchanged: append-only, every digit validated, fails loudly
rather than writing junk. Results are unofficial — the app already tells
users to verify with the official NJ Lottery.
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


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    # strip tags/scripts so we can parse plain text
    html = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style.*?</style>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text)


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
