# NJ Quick Draw historical feed (in progress)

The v3 engine at `quickdraw/index.html` automatically loads `data/history.json`.
The archive is sourced from the [NJ Lottery Quick Draw results search](https://www.njlottery.com/en-us/drawgames/quickDraw.html), which accepts draw-number ranges. The sampled batches are retained in `data/official-sample-*.json` for reproducibility.

**Coverage as captured September 24, 2026:** draws 1–5000 and 985725–987097, 6,373 verified records. Draws 5001–985724 (980,724 records) are missing. `data/coverage.json` states the gap explicitly; no missing draws are synthesized. The current archive is a demonstration of the feed format and engine connection, not a complete historical dataset or a continuously updated live feed.

To add an officially obtained draw-range batch, save its rows as a JSON array containing `draw_no`, `date_time` (MM/DD/YYYY hh:mm AM/PM), `numbers` (20 integers), `bullseye`, `doubleBullseye`, `multiplier`, `total_winners`, and `total_payout`. Then rebuild with:

```sh
python3 quickdraw/scripts/build_history.py quickdraw/data/official-sample-*.json path/to/new-batch.json
```

The script validates dates, unique sorted balls in 1–80, Bullseye membership, duplicates and conflicts. It writes the most recent 10,000 verified draws to `data/history.json` for the browser engine and `data/coverage.json` for **all** collected ranges. Source batches hold the complete collected archive. Repeat until the coverage gap count is zero; the engine's loaded window is deliberately smaller than the full archive.

`node quickdraw/scripts/collect_official.mjs --plan --max-batches 5` shows the next missing ranges. With Playwright and Chromium installed, remove `--plan` to collect and validate those ranges from the official search UI. The separate `Backfill NJ Quick Draw history` GitHub Actions workflow can run this in bounded, resumable batches after its first live run is verified. The collector rejects truncated responses; a broad 10,000-draw search returned only the newest 601 rows in a live check. The first unattended run and publication remain pending. Before building a million-row archive, split the stored data into shards and avoid loading the entire archive into browser memory or one GitHub file.
