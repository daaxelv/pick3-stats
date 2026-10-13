import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('build_history',Path(__file__).with_name('build_history.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def row(n=1,ball=7,date='09/30/2019 05:15 AM'):
    return dict(draw_no=n,number=ball,date_time=date,total_winners=1,total_payout=5)

class ArchiveTests(unittest.TestCase):
    def build(self, rows):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'batch.json';path.write_text(json.dumps(rows));return module.build([path])
    def test_leading_and_internal_gaps(self):
        rows,c=self.build([row(3),row(5)]);self.assertEqual(c['missing_draws'],3);self.assertEqual(c['gaps'][0]['from_draw'],1);self.assertFalse(c['complete'])
    def test_dedupe_and_complete(self):
        rows,c=self.build([row(),row(),row(2)]);self.assertEqual(c['loaded_draws'],2);self.assertTrue(c['complete'])
    def test_conflict(self):
        with self.assertRaises(ValueError):self.build([row(),row(ball=8)])
    def test_invalid(self):
        for raw in [row(ball=16),row(date='09/29/2019 05:15 AM'),dict(row(),total_payout=-1),dict(row(),total_winners=1.5)]:
            with self.assertRaises(ValueError):self.build([raw])
    def test_all_history_counts(self):
        rows,c=self.build([row(1),row(2,4),row(3)]);s=module.stats(rows);self.assertEqual(sum(r['hits'] for r in s['rows']),3);self.assertEqual(s['rows'][6]['hits'],2);self.assertEqual(s['rows'][6]['rank'],1)
    def test_source_gap_is_not_claimed_complete(self):
        rows,c=self.build([row(1),row(3)]);module.search_coverage(c,[dict(from_draw=1,to_draw=3)]);self.assertTrue(c['all_ranges_searched']);self.assertFalse(c['complete']);self.assertEqual(c['searched_missing_draws'],1);self.assertEqual(c['unsearched_draws'],0)
    def test_time_bins_use_recorded_local_hour_and_schedule_era(self):
        rows=[dict(draw_no=1,number=14,date_time='2022-06-26T23:45'),dict(draw_no=2,number=14,date_time='2022-06-27T00:02'),dict(draw_no=3,number=5,date_time='2022-06-27T12:02')]
        bins=module.time_bins(rows);self.assertEqual(sum(sum(b['counts']) for b in bins),3);old=next(b for b in bins if b['era']=='15min');self.assertEqual(old['hour'],23);self.assertEqual(old['weekday'],6);self.assertEqual(old['counts'][13],1);new=next(b for b in bins if b['hour']==0);self.assertEqual(new['era'],'4min');self.assertEqual(new['weekday'],0)

if __name__=='__main__':unittest.main()
