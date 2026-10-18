"""Validate and refresh the official NY Take 5 archive without third-party packages."""
import json
import os
import tempfile
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

SOURCE = 'https://data.ny.gov/resource/dg63-4siq.json?$limit=50000&$order=draw_date%20ASC'
DEST = Path(__file__).parent / 'data' / 'take5.json'


def normalize(records):
    if not isinstance(records, list) or not records:
        raise ValueError('Source returned no records; existing archive is retained')
    if len(records) >= 50000:
        raise ValueError('Source hit the request limit; paginate before accepting snapshot')
    found = {}
    for record in records:
        day = str(record.get('draw_date', ''))[:10]
        date.fromisoformat(day)
        for column, session in [('midday_winning_numbers', 'Midday'), ('evening_winning_numbers', 'Evening')]:
            raw = record.get(column)
            if not raw:
                continue
            nums = sorted(int(n) for n in raw.split())
            if len(nums) != 5 or len(set(nums)) != 5 or not all(1 <= n <= 39 for n in nums):
                raise ValueError(f'Invalid numbers: {day} {session}')
            key = (day, session)
            if key in found and found[key] != nums:
                raise ValueError(f'Conflicting results: {day} {session}')
            found[key] = nums
    rows = [[day, session, *nums] for (day, session), nums in found.items()]
    rows.sort(key=lambda r: (r[0], r[1] == 'Evening'))
    if not rows:
        raise ValueError('No drawings found; existing archive is retained')
    return rows


def merge_snapshot(old, new):
    # Never erase an older verified record when the upstream endpoint is partial.
    combined = {(r[0], r[1]): r for r in old}
    for r in new:
        identity = (r[0], r[1])
        if identity in combined and combined[identity] != r:
            raise ValueError(f'Archive/source conflict: {identity}; review correction manually')
        combined[identity] = r
    return sorted(combined.values(), key=lambda r: (r[0], r[1] == 'Evening'))


def main():
    req = urllib.request.Request(SOURCE, headers={'User-Agent': 'LotteryHistoryResearch/1.0'})
    with urllib.request.urlopen(req, timeout=90) as response:
        rows = normalize(json.load(response))
    existing = json.loads(DEST.read_text()) if DEST.exists() else {}
    rows = merge_snapshot(existing.get('rows', []), rows)
    if existing.get('rows') == rows:
        print(f'No changes: {len(rows):,} collected Take 5 drawings; latest {rows[-1][0]} {rows[-1][1]}')
        return
    payload = dict(schema=1, source=SOURCE, checked_at=datetime.now(timezone.utc).isoformat(),
                   note='Validated Midday and Evening records collected from the official NY Open Data dataset; no completeness claim for dates absent from source. Previously collected records are retained if absent in a later response.', rows=rows)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=DEST.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(payload, stream, separators=(',', ':'))
        os.replace(temp, DEST)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print(f'Saved {len(rows):,} collected Take 5 drawings; latest {rows[-1][0]} {rows[-1][1]}')


if __name__ == '__main__':
    main()
