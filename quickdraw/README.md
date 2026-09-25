# NJ Quick Draw historical feed (in progress)

The v3 engine at `quickdraw/index.html` automatically loads `data/history.json`.
The archive is sourced from the [NJ Lottery Quick Draw results search](https://www.njlottery.com/en-us/drawgames/quickDraw.html), which accepts draw-number ranges. The sampled batches are retained in `data/official-sample-*.json` for reproducibility.

**Initial coverage captured September 24, 2026:** draws 1–500 and 985725–987097, 1,873 verified records. Draws 501–985724 (985,224 records) were initially missing. `data/coverage.json` tracks the current state; no missing draws are synthesized. The browser engine retains the latest 10,000 available draws while the verified source batches hold all results collected so far.

To add an officially obtained draw-range batch, save its rows as a JSON array containing `draw_no`, `date_time` (MM/DD/YYYY hh:mm AM/PM), `numbers` (20 integers), `bullseye`, `doubleBullseye`, `multiplier`, `total_winners`, and `total_payout`. Then rebuild with:

```sh
python3 quickdraw/scripts/build_history.py quickdraw/data/official-sample-*.json path/to/new-batch.json
```

The script validates dates, unique sorted balls in 1–80, Bullseye membership, duplicates and conflicts. It writes the latest 10,000 draws to `data/history.json` for the browser engine and `data/coverage.json` for all collected ranges. Source batches hold all captured draws. Run `node quickdraw/scripts/collect_official.mjs --plan --max-batches 5` to inspect the next historical ranges; a live run also checks the official table's latest draw and captures any newer results first. The GitHub Actions workflow collects up to 100 verified 500-draw ranges each hour, resumes from recorded coverage, and commits successful batches even if a later search fails. It can also be started manually on `main` with up to 200 batches. The official search displayed only 601 rows for a 10,000-draw query, so the collector requests at most 500 and rejects truncated results. This backfill remains incomplete until `data/coverage.json` reports no historical gaps.
