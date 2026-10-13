"""Build full-history CASH POP statistics from verified official batches."""
import argparse
import json
import math
from datetime import datetime
from pathlib import Path

LAUNCH = '2019-09-30'

def normalize(raw):
    n, ball = raw['draw_no'], raw['number']
    if type(n) is not int or n < 1 or type(ball) is not int or not 1 <= ball <= 15:
        raise ValueError('Invalid draw number or ball')
    date = datetime.strptime(' '.join(raw['date_time'].split()), '%m/%d/%Y %I:%M %p')
    winners, payout = raw['total_winners'], raw['total_payout']
    if date.date().isoformat() < LAUNCH or type(winners) is not int or winners < 0 or type(payout) not in (int, float) or not math.isfinite(payout) or payout < 0:
        raise ValueError('Invalid date, winners or payout')
    return dict(draw_no=n, number=ball, date_time=date.strftime('%Y-%m-%dT%H:%M'), total_winners=winners, total_payout=payout)

def build(files):
    by_id = {}
    for file in files:
        batch = json.loads(Path(file).read_text())
        if not isinstance(batch, list):
            raise ValueError('Batch must be an array')
        for raw in batch:
            row = normalize(raw)
            if row['draw_no'] in by_id and row != by_id[row['draw_no']]:
                raise ValueError(f"Conflicting draw #{row['draw_no']}")
            by_id[row['draw_no']] = row
    rows = [by_id[n] for n in sorted(by_id)]
    gaps, expected = [], 1
    for row in rows:
        if row['draw_no'] > expected:
            gaps.append(dict(from_draw=expected, to_draw=row['draw_no']-1, count=row['draw_no']-expected))
        expected = row['draw_no']+1
    last = rows[-1]['draw_no'] if rows else 0
    if rows and rows[0]['draw_no'] == 1 and not rows[0]['date_time'].startswith(LAUNCH):
        raise ValueError('Draw #1 must match official launch date')
    coverage = dict(first_draw=rows[0]['draw_no'] if rows else None, last_draw=last, loaded_draws=len(rows), missing_draws=last-len(rows), gaps=gaps, complete=bool(rows) and not gaps, percent=100*len(rows)/last if last else 0)
    return rows, coverage

def stats(draws):
    rows = [dict(number=n, hits=0, share=0, last_draw=None, last_date=None) for n in range(1,16)]
    for draw in draws:
        r = rows[draw['number']-1]
        r['hits'] += 1
        r['last_draw'], r['last_date'] = draw['draw_no'], draw['date_time']
    for r in rows:
        r['share'] = r['hits']/len(draws) if draws else 0
    for rank, r in enumerate(sorted(rows, key=lambda r: (-r['hits'], r['number'])), 1):
        r['rank'] = rank
    return dict(count=len(draws), first_date=draws[0]['date_time'] if draws else None, last_date=draws[-1]['date_time'] if draws else None, rows=rows)

def search_coverage(coverage, searches):
    pending = [(g['from_draw'], g['to_draw']) for g in coverage['gaps']]
    for s in searches:
        a,b=s['from_draw'],s['to_draw']
        if type(a) is not int or type(b) is not int or a<1 or b<a or b-a>=500:
            raise ValueError('Invalid searched range')
        next_ranges=[]
        for x,y in pending:
            if b<x or a>y:next_ranges.append((x,y))
            else:
                if x<a:next_ranges.append((x,a-1))
                if y>b:next_ranges.append((b+1,y))
        pending=next_ranges
    unsearched=sum(b-a+1 for a,b in pending)
    coverage.update(unsearched_draws=unsearched, searched_missing_draws=coverage['missing_draws']-unsearched, all_ranges_searched=coverage['last_draw']>0 and unsearched==0)

def write_json(path, value):
    tmp = path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False)+'\n')
    tmp.replace(path)

def time_bins(rows):
    bins = {}
    for row in rows:
        stamp = datetime.strptime(row['date_time'], '%Y-%m-%dT%H:%M')
        era = '15min' if stamp.date().isoformat() < '2022-06-27' else '4min'
        key = (stamp.year, era, stamp.weekday(), stamp.hour, stamp.minute)
        counts = bins.setdefault(key, [0]*15)
        counts[row['number']-1] += 1
    return [dict(year=key[0], era=key[1], weekday=key[2], hour=key[3], minute=key[4], counts=counts) for key,counts in sorted(bins.items())]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path('cashpop/data'))
    args = parser.parse_args()
    files = sorted(args.data_dir.glob('official-sample-*.json'))
    rows, coverage = build(files)
    log=args.data_dir/'searched-ranges.json'
    search_coverage(coverage, json.loads(log.read_text()) if log.exists() else [])
    groups = dict(all=stats(rows), recent=stats(rows[-500:]))
    years = sorted({r['date_time'][:4] for r in rows})
    for year in years:
        subset = [r for r in rows if r['date_time'].startswith(year)]
        groups[year] = stats(subset)
        write_json(args.data_dir / f'history-{year}.json', subset)
    write_json(args.data_dir/'coverage.json', coverage)
    write_json(args.data_dir/'time-analysis.json', dict(schema=1, timezone='America/New_York', source='NJ Lottery official draw timestamps', coverage=coverage, first_date=rows[0]['date_time'] if rows else None, last_date=rows[-1]['date_time'] if rows else None, bins=time_bins(rows)))
    for number in range(1,16):
        write_json(args.data_dir/f'time-number-{number}.json', dict(schema=1, number=number, timezone='America/New_York', coverage=coverage, hits=[[r['draw_no'],r['date_time']] for r in rows if r['number']==number]))
    write_json(args.data_dir/'summary.json', dict(schema=1, coverage=coverage, groups=groups, recent=list(reversed(rows[-50:])), history_files=[f'history-{year}.json' for year in years]))
    print(json.dumps({k:v for k,v in coverage.items() if k!='gaps'}))

if __name__ == '__main__':
    main()
