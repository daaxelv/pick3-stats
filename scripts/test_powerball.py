import copy
import json
from pathlib import Path
import unittest
from collect_powerball import normalize, limits
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
        self.assertEqual(len(normalize(self.rows+self.rows)),2)
    def test_saved_archive_complete(self):
        data=json.loads((Path(__file__).resolve().parents[1]/'powerball/data/history.json').read_text())
        raw=[{'draw_date':r['date'],'winning_numbers':' '.join(map(str,r['nums']+[r['pb']])),'multiplier':r['power_play']} for r in data['draws']]
        self.assertEqual(len(normalize(raw)),data['total_draws'])
