"""Validated, paginated official Powerball archive; never replace good data on failure."""
import datetime as dt
import json
import os
from pathlib import Path
import time
import urllib.request
from zoneinfo import ZoneInfo

URL = 'https://data.ny.gov/resource/d6yy-54nr.json'
ROOT = Path(__file__).resolve().parents[1] / 'powerball' / 'data'

def limits(day):
    return (69,26) if day >= '2015-10-07' else (59,35) if day >= '2012-01-18' else (59,39)

def normalize(raw):
    found = {}
    for row in raw:
        day = row['draw_date'][:10]
        date = dt.date.fromisoformat(day)
        values = [int(n) for n in row['winning_numbers'].split()]
        hi, ball_hi = limits(day)
        if len(values) != 6 or len(set(values[:5])) != 5 or any(not 1 <= n <= hi for n in values[:5]) or not 1 <= values[5] <= ball_hi:
            raise ValueError('Invalid numbers on ' + day)
        if date.weekday() not in ([0,2,5] if day >= '2021-08-23' else [2,5]):
            raise ValueError('Unexpected draw date ' + day)
        item = dict(date=day, nums=sorted(values[:5]), pb=values[5], power_play=int(row['multiplier']) if row.get('multiplier') else None)
        if day in found and found[day] != item:
            raise ValueError('Conflicting draw ' + day)
        found[day] = item
    if not found:
        raise ValueError('Empty archive')
    rows = sorted(found.values(), key=lambda r:r['date'])
    if rows[0]['date'] != '2010-02-03':
        raise ValueError('Archive start is incomplete')
    day, end = dt.date.fromisoformat(rows[0]['date']), dt.date.fromisoformat(rows[-1]['date'])
    while day <= end:
        s = day.isoformat()
        if day.weekday() in ([0,2,5] if s >= '2021-08-23' else [2,5]) and s not in found:
            raise ValueError('Missing scheduled draw ' + s)
        day += dt.timedelta(days=1)
    return rows

def request(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                return json.load(response)
        except Exception:
            if attempt == 2: raise
            time.sleep(2 ** attempt)

def save(raw):
    rows = normalize(raw)
    today = dt.datetime.now(ZoneInfo('America/New_York')).date()
    if dt.date.fromisoformat(rows[-1]['date']) > today:
        raise ValueError('Source contains a future draw')
    # Allow a full publication day; the afternoon retry can collect late updates.
    expected = today - dt.timedelta(days=1)
    while expected.weekday() not in [0,2,5]:
        expected -= dt.timedelta(days=1)
    if rows[-1]['date'] < expected.isoformat():
        raise ValueError('Source has not published the expected draw ' + expected.isoformat())
    path = ROOT / 'history.json'
    if path.exists():
        previous = json.loads(path.read_text())['draws']
        fresh = {r['date']:r for r in rows}
        if any(r['date'] not in fresh for r in previous):
            raise ValueError('Source lost previously collected dates')
    current = [r for r in rows if r['date'] >= '2015-10-07']
    payload = dict(source=URL, checked_at=dt.datetime.now(dt.timezone.utc).isoformat(), first_date=rows[0]['date'], last_date=rows[-1]['date'], total_draws=len(rows), current_format_draws=len(current), missing_scheduled_draws=0, archive_note='Official archive starts February 3, 2010; 1992–2009 not included.', draws=rows)
    ROOT.mkdir(parents=True,exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,separators=(',',':'))+'\n')
    os.replace(tmp,path)
    print(f"Verified {len(rows)} draws; {rows[0]['date']} through {rows[-1]['date']}; current format {len(current)}")

if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser(); p.add_argument('--source-file'); args=p.parse_args()
    if args.source_file:
        raw=json.loads(Path(args.source_file).read_text())
    else:
        raw=[]; offset=0
        while True:
            batch=request(f'{URL}?$limit=1000&$offset={offset}&$order=draw_date')
            raw.extend(batch)
            if len(batch)<1000: break
            offset+=1000
    save(raw)
