"""Validate official Quick Draw search batches and build an engine-ready archive.

Usage: python3 quickdraw/scripts/build_history.py batch1.json batch2.json ...
The input files contain rows transcribed from the NJ Lottery's draw-range table.
No missing draws are invented; coverage is reported separately.
"""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path


def optional_number(value):
    value = str(value).strip()
    return None if value in ("", "N/A", "NA") else int(value)


def normalize(raw):
    number = int(raw["draw_no"])
    date = datetime.strptime(" ".join(raw["date_time"].split()), "%m/%d/%Y %I:%M %p")
    balls = list(map(int, raw["numbers"]))
    if number < 1 or date.date().isoformat() < "2017-07-17":
        raise ValueError(f"invalid draw/date: {number}")
    if len(balls) != 20 or len(set(balls)) != 20 or any(n < 1 or n > 80 for n in balls):
        raise ValueError(f"invalid 20-ball result: {number}")
    if balls != sorted(balls):
        raise ValueError(f"unsorted numbers: {number}")
    bullseye = optional_number(raw.get("bullseye", "N/A"))
    double = optional_number(raw.get("doubleBullseye", "N/A"))
    if any(n is not None and n not in balls for n in (bullseye, double)):
        raise ValueError(f"Bullseye outside winning numbers: {number}")
    multiplier_text = str(raw.get("multiplier", "NA"))
    if not re.fullmatch(r"X\d+|NA|N/A", multiplier_text):
        raise ValueError(f"invalid multiplier: {number}")
    return {
        "date": date.date().isoformat(),
        "time": date.strftime("%H:%M"),
        "draw_no": number,
        "numbers": balls,
        "bullseye": bullseye,
        "doubleBullseye": double,
        "multiplier": multiplier_text,
        "totalWinners": int(raw["total_winners"]),
        "totalPayout": raw["total_payout"],
        "source": "NJ Lottery official results search",
    }


def build(files):
    draws = {}
    for path in files:
        for raw in json.loads(Path(path).read_text()):
            row = normalize(raw)
            number = row["draw_no"]
            if number in draws and row != draws[number]:
                raise ValueError(f"conflicting draw #{number} in {path}")
            draws[number] = row
    ordered = [draws[n] for n in sorted(draws)]
    gaps = []
    for a, b in zip(ordered, ordered[1:]):
        if b["draw_no"] != a["draw_no"] + 1:
            gaps.append({"from": a["draw_no"] + 1, "to": b["draw_no"] - 1,
                         "count": b["draw_no"] - a["draw_no"] - 1})
    return ordered, {
        "first_draw": ordered[0]["draw_no"] if ordered else None,
        "last_draw": ordered[-1]["draw_no"] if ordered else None,
        "loaded_draws": len(ordered),
        "missing_draws_between_loaded_endpoints": sum(g["count"] for g in gaps),
        "gaps": gaps,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batches", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, default=Path("quickdraw/data/history.json"))
    args = parser.parse_args()
    rows, coverage = build(args.batches)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Keep the browser payload bounded while preserving all source batches.
    args.output.write_text(json.dumps(rows[-10000:], separators=(",", ":")) + "\n")
    args.output.with_name("coverage.json").write_text(json.dumps(coverage, indent=2) + "\n")
    print(json.dumps(coverage, indent=2))


if __name__ == "__main__":
    main()
