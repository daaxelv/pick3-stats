# Phase 1: rolling recent-winner cooldown

Prepared against `daaxelv/pick3-stats` main at commit `ff77cfd` on September 21, 2026.
Implementation and validation are described below. GitHub Actions shows the current deployment status for the commit containing this update.

## What changed

- Recent Winner Cooldown starts ON with a 7-draw window. Choices: 1, 3, 7, 14, 30. Each engine remembers its ON/OFF, window, and ALL draws settings.
- Every exclusion comes from actual dated results, not the old `overdue[]` aggregates or permanent `recentHit` flags.
- Midday counts Midday draws; Evening counts Evening draws. Combined sorts both histories by date, with Midday before Evening on the same day. Optional ALL draws uses that combined timeline for the selected engine's cooldown, without changing its scoring history.
- Top 25, Top 100, unique, doubles, the 10-play plan, and its payout table use the same eligible pool for that engine. A winner becomes eligible again after it leaves the last N draw results. Eligibility does not guarantee a top ranking.
- Repeat occurrences count as separate draws. Leading zeroes are preserved. Exclusion matches the exact three-digit result; box permutations and Fireball variants are not additional exclusions.
- CSV, manual entries, bulk imports, and JSON backups merge by date plus draw, so a manually entered draw is not counted again when it arrives in the CSV. A local manual correction overrides the CSV entry for that draw until the manual correction is removed.
- Saved local results are validated and sorted chronologically. JSON backup validation is transactional: invalid records reject the import without replacing existing saved results. The existing manual storage key and export/import format are retained.
- Ticket Tracker's Add winner now also persists the result and reruns all three recommendation engines.
- The last successfully loaded Pick 3 history is cached locally and retained after a failed refresh. If no real history is available, the page says the cooldown window is incomplete instead of fabricating exclusions from aggregate data. Cached history can be older than the latest draw; Data Coverage shows source/freshness.
- Existing CSV fetch, manual refresh, five-minute/focus refresh, payout calculations, Pick 4 and M4L handling are preserved. The poller also notices corrected results when row counts are unchanged. Collector scripts, CSV data, and the scheduled GitHub workflow are unchanged.
- HIT marks still annotate box/Fireball connections, but their separate hide-in-tables switch was removed so it cannot disagree with the cooldown. Marks use the same merged history and update when results change.
- The service-worker version was increased and includes the new history helper, so the updated app can load offline after a successful visit.

## Files to commit

Runtime files (all three are required together):

1. `index.html` — controls, persistence, history integration, feed refresh, shared eligibility and updated explanatory text.
2. `recent-history.js` — new validated chronological history and exact-combo cooldown helpers.
3. `service-worker.js` — updated cache version and new helper asset.

Also included: `recent-history.test.mjs`, `cooldown.test.mjs`, and this guide. The existing `odds.test.mjs` remains unchanged in the repository.

## Validation completed

`node --test odds.test.mjs recent-history.test.mjs cooldown.test.mjs`

Result: **54 tests passed, 0 failed** (21 existing odds tests, 12 helper tests, 21 integration tests).

Coverage includes all five window boundaries, automatic re-entry, repeated winners, exact matching and leading zeroes, session separation and ALL scope, shared recommendation exclusions in all modes, chronological migration/imports, corrections and deduplication, Tracker entry, preference persistence, cached history, live refresh success/failure, poller append/corrections, and mixed Pick 3/Pick 4/M4L data. Integration tests also use the repository's 26,892-row Pick 3 history.

All inline scripts pass a syntax check; HTML closing tags are intact; `git diff --check` passes. Browser verification confirmed startup, all five choices, ON/OFF and ALL controls, correct history per engine, persistence after reload, and no captured console warnings/errors. The published site's original controls were inspected before comparison with the local preview.

## Easiest deployment: GitHub website

1. Extract `pick3-phase1-update.zip` on your computer.
2. Sign in to GitHub and open https://github.com/daaxelv/pick3-stats on the `main` branch.
3. Choose **Add file → Upload files**. Upload the six files inside the extracted folder into the repository root, keeping the exact filenames. Do not upload the ZIP itself or a containing folder. Existing `index.html` and `service-worker.js` will be replaced; `recent-history.js` is new.
4. Review the change and commit with the message **Fix rolling recent-winner cooldown**. You can commit directly to main, or create a branch and merge its pull request.
5. In **Settings → Pages**, confirm the existing publishing source. If it is `main` and `/ (root)`, the commit triggers the Pages deployment. If another source is configured, put the same runtime files into that source through your existing publishing process.
6. Wait for the Pages deployment in **Actions** to succeed, then open https://daaxelv.github.io/pick3-stats/ and reload. If the previous cached version appears, close and reopen the tab, then reload again. Do not clear site storage: it contains your manual results.
7. Verify **Recent Winner Cooldown** is checked, **7 draws** is selected for a fresh preference state, and **14 / 30** appear in the menu. Existing saved cooldown choices take precedence after first use. Verify the notice lists dates/draws in the correct scope.

## Git alternative

Use the supplied `pick3-phase1.patch` from a clean, current checkout of this repository. It contains the same six files as the ZIP.

```sh
git switch main
git pull --ff-only
git switch -c fix/recent-winner-cooldown
git apply --check /path/to/pick3-phase1.patch
git apply /path/to/pick3-phase1.patch
node --test odds.test.mjs recent-history.test.mjs cooldown.test.mjs
git add index.html recent-history.js service-worker.js recent-history.test.mjs cooldown.test.mjs PHASE1_COOLDOWN.md
git commit -m "Fix rolling recent-winner cooldown"
git push -u origin fix/recent-winner-cooldown
```

Replace `/path/to/pick3-phase1.patch` with its actual path. If the check reports a conflict, stop and reconcile the newer source before applying. On GitHub, open a pull request for the pushed branch and merge it into the publishing branch. No new dependencies or build step are required; the tests need Node.js.

This delivery covers Phase 1. It does not finish missing-current-data collection or implement the Quick Draw collector.
