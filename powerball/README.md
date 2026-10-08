# Powerball engine

Official main-game national drawing results from NY Open Data `d6yy-54nr`, starting February 3, 2010. This is the source's available archive, not the entire 1992-present history. The initial snapshot contains 2,009 draws through October 7, 2026, including 1,417 under the current format. Power Play is stored when supplied. Double Play, historical jackpot amounts and actual sold-ticket winner counts are not included.

The collector paginates the whole archive, validates era-specific limits, distinct white balls, dates, duplicate conflicts and scheduled-date continuity. It rejects empty, truncated, stale and future snapshots, keeps previously collected dates, and replaces the file atomically. Automation runs after Mon/Wed/Sat drawings plus a publication retry; GitHub scheduling can be delayed. Saves use the shared rebase/retry helper to preserve concurrent engine updates.

Current-format statistics and the M4L-derived G.O.D. research models use only draws from October 7, 2015, avoiding mixed number pools. Rankings are descriptive. No measured ball physics is available. Walk-forward testing uses prior draws only; uniform ties follow number order.

Mock drawings use fixed uniform virtual-crowd tickets and a recorded seed. Duplicate tickets count separately. Calendar dates follow Mon/Wed/Sat. The optional 04 filter restricts crowd tickets and candidates, not drawing probabilities. Full coverage calculates exact tier counts across all 292,201,338 distinct tickets without materializing them. Its top-three saved sets are representatives, labeled with multiplicity, not an exhaustive winning-ticket list.

Run settings are saved before starting. Each announced drawing is stored before the result; results and top-three winning sets are saved after every draw. Browser termination marks the previous run interrupted on reopening. Quota/write errors stop the run and leave an exportable in-memory journal. Persistence is local to the browser; CSV exports are the backup. The calendar displays the latest 500 draw records; exports contain all saved records including interrupted announced drawings. Different tabs/devices do not share journals.

Run locally with `python -m http.server`. Tests: `node --test powerball/*.test.mjs` and `python -m unittest discover -s scripts -p 'test_powerball.py'`.
