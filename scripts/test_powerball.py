import copy
import json
from pathlib import Path
import unittest
import datetime as dt
from collect_powerball import FIRST_DRAW, normalize, limits
from backfill_powerball import parse_month
class PowerballTests(unittest.TestCase):
    def setUp(self):
        self.rows=[{'draw_date':'2010-02-03T00:00:00.000','winning_numbers':'17 22 36 37 52 24','multiplier':'2'}, {'draw_date':'2010-02-06T00:00:00.000','winning_numbers':'14 22 52 54 59 04','multiplier':'3'}]
    def test_gaps_fail(self):
        rows=self.rows+[{'draw_date':'2010-02-13','winning_numbers':'1 2 3 4 5 6'}]
        with self.assertRaisesRegex(ValueError,'Missing'):normalize(rows)
    def test_duplicate_conflicts_and_invalid_fail(self):
        for nums in ['1 1 2 3 4 6','1 2 3 4 60 6','1 2 3 4 5 40','1 2 3']:
            rows=copy.deepcopy(self.rows);rows[0]['winning_numbers']=nums
            with self.assertRaises(ValueError):normalize(rows)
        with self.assertRaisesRegex(ValueError,'Conflicting'):normalize(self.rows+[dict(self.rows[0],winning_numbers='1 2 3 4 5 6')])
    def test_limits_and_normalization(self):
        self.assertEqual(limits('2012-01-14'),(59,39));self.assertEqual(limits('2012-01-18'),(59,35));self.assertEqual(limits('2015-10-07'),(69,26))
        for day, expected in [('1992-04-22',(45,45)),('1997-11-01',(45,45)),('1997-11-05',(49,42)),('2002-10-05',(49,42)),('2002-10-09',(53,42)),('2005-08-27',(53,42)),('2005-08-31',(55,42)),('2009-01-03',(55,42)),('2009-01-07',(59,39))]:
            self.assertEqual(limits(day),expected)
        with self.assertRaises(ValueError): limits('1992-04-18')
        self.assertEqual(len(normalize(self.rows+self.rows)),2)
    def test_saved_archive_complete(self):
        data=json.loads((Path(__file__).resolve().parents[1]/'powerball/data/history.json').read_text())
        raw=[{'draw_date':r['date'],'winning_numbers':' '.join(map(str,r['nums']+[r['pb']])),'multiplier':r['power_play']} for r in data['draws']]
        self.assertEqual(len(normalize(raw,start=data['first_date'])),data['total_draws'])
    def april_html(self):
        return '<table><tr><th>Date</th><th>Powerball</th></tr>'+''.join(
            '<tr><td>'+day+'</td><td>'+''.join('<span>'+n+'</span>' for n in numbers.split())+'</td></tr>'
            for day,numbers in [('4/29/1992','01 08 10 28 35 10 01*'),('4/25/1992','06 09 22 42 44 12 01*'),('4/22/1992','02 25 35 41 42 15 01*'),('4/18/1992','02 14 21 38 43 54 01*')])+'</table>'
    def test_first_month_excludes_prelaunch_and_power_play_placeholder(self):
        rows=parse_month(self.april_html(),1992,4)
        self.assertEqual(len(rows),3)
        first=normalize(rows,start=FIRST_DRAW)[0]
        self.assertEqual(first,dict(date=FIRST_DRAW,nums=[2,25,35,41,42],pb=15,power_play=None))
    def test_missing_duplicate_malformed_and_wrong_month_fail(self):
        text=self.april_html()
        for bad in [text.replace('4/29/1992','4/25/1992'), text.replace('4/29/1992','5/29/1992'), text.replace('<span>44</span>',''), text.replace('<span>44</span>','<span>46</span>'), '<html>Unavailable</html>']:
            with self.assertRaises(ValueError):parse_month(bad,1992,4)
    def test_historical_ten_times_power_play(self):
        # Official March 11, 2006 result used the promotional 10x multiplier.
        days=[dt.date(2006,3,d) for d in range(1,32) if dt.date(2006,3,d).weekday() in [2,5]]
        text='<table>'+''.join(f'<tr><td>{d.month}/{d.day}/{d.year}</td><td>16 35 37 52 54 33 {10 if d.day==11 else 2:02}*</td></tr>' for d in days)+'</table>'
        rows=parse_month(text,2006,3)
        self.assertEqual(next(r['multiplier'] for r in rows if r['draw_date']=='2006-03-11'),10)
        with self.assertRaisesRegex(ValueError,'Invalid Power Play'):
            parse_month(text.replace('10*','08*'),2006,3)
    def test_legacy_archive_complete_and_matches_counts(self):
        path=Path(__file__).resolve().parents[1]/'powerball/data/legacy-history.json'
        if not path.exists(): self.skipTest('One-time backfill is not yet available')
        data=json.loads(path.read_text())
        rows=normalize(data['raw'],start=FIRST_DRAW)
        self.assertEqual(len(rows),data['draw_count'])
        self.assertEqual(rows[-1]['date'],'2010-01-30')
        self.assertEqual(data['overlap_verified_draws'],8)
