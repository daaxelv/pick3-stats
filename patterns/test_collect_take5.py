import unittest
from collect_take5 import normalize, merge_snapshot


class Take5Tests(unittest.TestCase):
    def test_sessions_sort_and_duplicate(self):
        source = [{'draw_date': '2026-10-16T00:00:00', 'midday_winning_numbers': '08 26 29 30 32', 'evening_winning_numbers': '05 09 14 18 24'}]
        rows = normalize(source + source)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], ['2026-10-16', 'Midday', 8, 26, 29, 30, 32])
        self.assertEqual(rows[1][1], 'Evening')

    def test_reject_empty_invalid_and_conflicting(self):
        with self.assertRaises(ValueError):
            normalize([])
        for numbers in ['01 01 02 03 04', '01 02 03 04 40', '01 02 03']:
            with self.assertRaises(ValueError):
                normalize([{'draw_date': '2026-10-16', 'evening_winning_numbers': numbers}])
        with self.assertRaises(ValueError):
            normalize([{'draw_date': '2026-10-16', 'evening_winning_numbers': n} for n in ['01 02 03 04 05', '01 02 03 04 06']])

    def test_partial_snapshots_retain_history_and_conflicts_fail(self):
        old = [['2026-10-15', 'Evening', 1, 2, 3, 4, 5]]
        new = [['2026-10-16', 'Midday', 2, 3, 4, 5, 6]]
        self.assertEqual(len(merge_snapshot(old, new)), 2)
        with self.assertRaises(ValueError):
            merge_snapshot(old, [['2026-10-15', 'Evening', 1, 2, 3, 4, 6]])


if __name__ == '__main__':
    unittest.main()
