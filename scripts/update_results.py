#!/usr/bin/env python3
"""
Daily NJ Lottery results updater — Pick 3 and Pick 4 (midday + evening).

Runs automatically via GitHub Actions (see .github/workflows/update-results.yml).
Fetches the latest results from the NJ Lottery website's draw-games API,
validates them, and appends new rows to data/nj_numbers_canonical.csv.

Safety rules:
- NEVER modifies or deletes existing rows (append-only).
- Validates every digit (0-9) before writing.
- Exits with an error (failing the workflow loudly) if the source
  can't be read or returns malformed data, rather than writing junk.

NOTE FOR SETUP: The NJ Lottery API endpoint or response format may change.
If this script starts failing, ask Replit/Claude to inspect
https://www.njlottery.com/en-us/drawgames/pick3.html network requests
and update API_URL / parse_draws() accordingly.
"""

import csv
import json
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "nj_numbers_canonical.csv"

# NJ Lottery draw-games API (used by their own website).
API_URL = (
    "https://www.njlottery.com/api/v2/draw-games/draws"
    "?game-names={game}&status=CLOSED&size=14&order-by=DRAW_TIME&order-direction=DESC"
)

GAMES = {
    "Pick 3": {"code": "P3", "digits": 3},
    "Pick 4": {"code": "P4", "digits": 4},
}

HEADERS = {"User-Agent": "Mozilla/5.0 (results-updater; personal stats project)"}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


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
