"""One-time, resumable official Delaware archive backfill, 1992 to early 2010.

Cache monthly raw HTML for reproducibility. Four requests at most in flight;
failed or incomplete months never enter the published archive.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import time
import urllib.request

from collect_powerball import FIRST_DRAW, ROOT, URL, normalize, request

BASE = 'https://www.delottery.com/Winning-Numbers/Search-Winners-Printable'

class TableRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.cells = None
        self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.cells = []
        elif tag == 'td' and self.cells is not None: self.cell = []
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.cells.append(' '.join(self.cell).strip())
            self.cell = None
        elif tag == 'tr' and self.cells is not None:
            self.rows.append(self.cells)
            self.cells = None

def parse_month(text, year, month):
    parser = TableRows()
    parser.feed(text)
    raw = []
    for cells in parser.rows:
        if not cells or not re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}', cells[0]):
            continue
        day = dt.datetime.strptime(cells[0], '%m/%d/%Y').date()
        if (day.year, day.month) != (year,month):
            raise ValueError('Source returned a different month')
        if day.isoformat() < FIRST_DRAW:
            # Delaware labels pre-launch Lotto America rows as Powerball.
            continue
        if len(cells) != 2:
            raise ValueError('Malformed source table row on ' + day.isoformat())
        values = re.findall(r'\d+', cells[1])
        has_multiplier = cells[1].rstrip().endswith('*')
        if len(values) != (7 if has_multiplier else 6):
            raise ValueError('Malformed drawing numbers on ' + day.isoformat())
        # The old source uses 01* as a placeholder before Power Play existed.
        multiplier = int(values[6]) if len(values) == 7 and day.isoformat() >= '2001-03-07' else None
        if multiplier is not None and multiplier not in [1,2,3,4,5]:
            raise ValueError('Invalid Power Play on ' + day.isoformat())
        raw.append({'draw_date':day.isoformat(), 'winning_numbers':' '.join(values[:6]), 'multiplier':multiplier})
    start = max(FIRST_DRAW, f'{year:04}-{month:02}-01')
    day = dt.date.fromisoformat(start)
    expected = []
    while (day.year,day.month) == (year,month):
        if day.weekday() in [2,5]: expected.append(day.isoformat())
        day += dt.timedelta(days=1)
    dates = [r['draw_date'] for r in raw]
    if sorted(dates) != expected:
        raise ValueError(f'Incomplete/duplicate month {year}-{month:02}: expected {expected}, got {sorted(dates)}')
    # Independently validate each month's number pools and calendar.
    normalize(raw, start=expected[0])
    return raw

def fetch_month(year, month, cache):
    path = cache / f'{year}-{month:02}.html'
    if path.exists():
        return parse_month(path.read_text(),year,month)
    url = f'{BASE}/{year}/{month}/powerball'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=40) as response:
                text = response.read().decode('utf-8')
            rows = parse_month(text,year,month)
            path.write_text(text)
            return rows
        except Exception:
            if attempt == 2: raise
            time.sleep(2 ** attempt)

def build(raw, modern, output):
    rows = normalize(raw, start=FIRST_DRAW)
    current = {r['date']:r for r in normalize(modern)}
    overlap = [r for r in rows if r['date'] >= '2010-02-03']
    if len(overlap) < 8:
        raise ValueError('Need February 2010 official-source overlap')
    for row in overlap:
        if row['date'] not in current or current[row['date']] != row:
            raise ValueError('Official sources disagree on ' + row['date'])
    legacy = [r for r in raw if r['draw_date'] < '2010-02-03']
    normalize(legacy, start=FIRST_DRAW)
    payload = dict(source=BASE, checked_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                   first_date=FIRST_DRAW, last_date=max(r['draw_date'] for r in legacy),
                   draw_count=len(legacy), overlap_source=URL, overlap_verified_draws=len(overlap),
                   source_template=BASE+'/{year}/{month}/powerball',
                   note='Pre-launch Lotto America rows excluded. Pre-March 7, 2001 Power Play placeholders stored as null.', raw=sorted(legacy,key=lambda r:r['draw_date']))
    temp = output.with_suffix('.tmp')
    temp.write_text(json.dumps(payload,separators=(',',':'))+'\n')
    os.replace(temp,output)
    return payload

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--modern-source-file', type=Path)
    args=parser.parse_args()
    args.cache.mkdir(parents=True,exist_ok=True)
    months=[(y,m) for y in range(1992,2011) for m in range(1,13)
            if (y,m)>=(1992,4) and (y,m)<=(2010,2)]
    raw=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending={pool.submit(fetch_month,y,m,args.cache):(y,m) for y,m in months}
        for done, future in enumerate(as_completed(pending),1):
            y,m=pending[future]
            raw.extend(future.result())
            if done%10==0 or done==len(months):
                print(f'Verified {done}/{len(months)} months, {len(raw)} drawings',flush=True)
    if args.modern_source_file:
        modern=json.loads(args.modern_source_file.read_text())
    else:
        modern=[]
        offset=0
        while True:
            batch=request(f'{URL}?$limit=1000&$offset={offset}&$order=draw_date')
            modern.extend(batch)
            if len(batch)<1000: break
            offset+=1000
    payload=build(raw,modern,ROOT/'legacy-history.json')
    from collect_powerball import save
    save(modern)
    print(f"Saved {payload['draw_count']} legacy draws from {payload['first_date']} to {payload['last_date']}; {payload['overlap_verified_draws']} overlap draws agree.")
