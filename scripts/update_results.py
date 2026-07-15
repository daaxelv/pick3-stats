#!/usr/bin/env python3
"""
Daily NJ Lottery results updater — Pick 3, Pick 4 (midday + evening), and
Millionaire for Life (nightly).

Runs automatically via GitHub Actions (see .github/workflows/update-results.yml).
Fetches the latest results from the NJ Lottery website's draw-games API
(Pick 3 / Pick 4) and from LotteryUSA's Millionaire for Life results page
(Millionaire for Life has no public NJ Lottery API endpoint at launch time),
validates them, and appends new rows to data/nj_numbers_canonical.csv.

Safety rules:
- NEVER modifies or deletes existing rows (append-only).
- Validates every digit/number before writing.
- Exits with an error (failing the workflow loudly) if any source can't be
  read or returns malformed data, rather than writing junk.

NOTE FOR SETUP: The NJ Lottery API endpoint or response format may change.
If this script starts failing, ask Replit/Claude to inspect
https://www.njlottery.com/en-us/drawgames/pick3.html network requests
and update API_URL / parse_draws() accordingly.

NOTE FOR M4L: Millionaire for Life (5 of 58 + Millionaire Ball 1-5) launched
in NJ on 2026-02-22 and is scraped from
https://www.lotteryusa.com/new-jersey/millionaire-for-life/ (a results page,
not an API) because the game is too new to have a documented NJ Lottery API
endpoint yet. If LotteryUSA changes its page markup, this script starts
failing loudly rather than silently — update M4L_DRAW_BLOCK_RE / M4L_DATE_RE
/ M4L_BALL_RE / M4L_BONUS_RE in parse_m4l_draws() to match the new markup,
or switch M4L_SOURCE_URL to the official NJ Lottery API once one exists.
"""

import csv
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "nj_numbers_canonical.csv"

# NJ Lottery draw-games API (used by their own website). Pick 3 / Pick 4 only.
API_URL = (
    "https://www.njlottery.com/api/v2/draw-games/draws"
    "?game-names={game}&status=CLOSED&size=14&order-by=DRAW_TIME&order-direction=DESC"
)

GAMES = {
    "Pick 3": {"code": "P3", "digits": 3},
    "Pick 4": {"code": "P4", "digits": 4},
}

HEADERS = {"User-Agent": "Mozilla/5.0 (results-updater; personal stats project)"}

# --- Millionaire for Life (M4L) ---
# Not a digit game: 5 numbers from 1-58 (no repeats) + 1 Millionaire Ball
# from 1-5, drawn nightly. Scraped from LotteryUSA's results table since
# there's no known NJ Lottery API endpoint for it yet (see module docstring).
M4L_GAME_CODE = "M4L"
M4L_SOURCE_URL = "https://www.lotteryusa.com/new-jersey/millionaire-for-life/"

M4L_DRAW_BLOCK_RE = re.compile(
    r'<tr class="c-results-table__item c-results-table__item--medium c-draw-card">(.*?)</tr>',
    re.S,
)
M4L_DATE_RE = re.compile(r'c-draw-card__draw-date-sub">\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*<')
M4L_BALL_RE = re.compile(r'class="c-ball c-ball--sm">(\d{1,2})</li>')
M4L_BONUS_RE = re.compile(r'c-ball--green c-ball--sm">(\d)</span>')


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_draws(payload: dict, game_name: str, n_digits: int):
    """Yield (date_iso, draw_MID_or_EVE, digits_dashed, fireball) tuples."""
    for item in payload.get("draws", []):
        # Draw time: epoch ms. NJ midday ~12:59 ET, evening ~22:57 ET.
        ts = item.get("drawTime") or item.get("draw_time")
        if ts is None:
            continue
        dt = datetime.utcfromtimestamp(int(ts) / 1000) - timedelta(hours=5)  # approx ET
        draw_type = "MID" if dt.hour < 17 else "EVE"

        results = item.get("results") or []
        if not results:
            continue
        primary = results[0].get("primary") or []
        digits = [str(d) for d in primary[:n_digits]]
        fireball = ""
        secondary = results[0].get("secondary") or []
        if secondary:
            fireball = str(secondary[0])
        elif len(primary) > n_digits:
            fireball = str(primary[n_digits])

        if len(digits) != n_digits or not all(d.isdigit() and len(d) == 1 for d in digits):
            raise ValueError(f"Malformed {game_name} draw on {dt.date()}: {primary}")
        if fireball and not (fireball.isdigit() and len(fireball) == 1):
            fireball = ""

        yield dt.date().isoformat(), draw_type, "-".join(digits), fireball


def parse_m4l_draws(html: str):
    """Yield (date_iso, digits_dashed, millionaire_ball) tuples from the
    LotteryUSA Millionaire for Life results page.

    digits_dashed is the 5 winning numbers (1-58, ascending, no repeats)
    joined with '-'; millionaire_ball is a single digit string 1-5.
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
            # Ad slots and other non-draw rows share the same <tr> class;
            # skip anything that isn't a real 5-ball + Millionaire Ball row.
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
        header = next(reader)
        for row in reader:
            if len(row) >= 3:
                existing.add((row[0], row[1], row[2]))  # (game, date, draw)

    new_rows = []
    for game_name, cfg in GAMES.items():
        url = API_URL.format(game=urllib.parse.quote(game_name))
        try:
            payload = fetch_json(url)
        except Exception as exc:
            print(f"ERROR fetching {game_name}: {exc}", file=sys.stderr)
            return 1
        for date_iso, draw_type, digits, fireball in parse_draws(
            payload, game_name, cfg["digits"]
        ):
            key = (cfg["code"], date_iso, draw_type)
            if key not in existing:
                new_rows.append([cfg["code"], date_iso, draw_type, digits, fireball, ""])
                existing.add(key)

    # Millionaire for Life: single nightly draw, no MID/EVE split, scraped
    # from LotteryUSA rather than the NJ Lottery API (see module docstring).
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
        print("No new draws found — already up to date.")
        return 0

    new_rows.sort(key=lambda r: (r[0], r[1], r[2]))
    with open(CSV_PATH, "a", newline="") as f:
        csv.writer(f).writerows(new_rows)

    for r in new_rows:
        print(f"Added: {r[0]} {r[1]} {r[2]} {r[3]}" + (f" FB:{r[4]}" if r[4] else ""))
    print(f"{len(new_rows)} new draw(s) appended.")
    return 0


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (used in main)
    sys.exit(main())
