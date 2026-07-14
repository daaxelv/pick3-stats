# PROJECT AUDIT — NJ Pick 3 App
Audit date: July 14, 2026 · 119 files reviewed (13 MB uncompressed)

## 1. THE BIG FINDING: THERE IS NO PYTHON CODE

The plan ("existing Python code → Streamlit") does not match what exists.
The entire project is **self-contained HTML/JavaScript applications** — no .py
files, no requirements.txt, no README. This is not bad news: it changes the
deployment strategy in your favor (see Section 7).

## 2. CRITICAL SECURITY FINDING

- `OPENROUTER KEY.txt` contains a live OpenRouter API key.
- ACTION REQUIRED: Revoke/rotate the key at openrouter.ai immediately.
  Delete this file before uploading the project anywhere (Replit, GitHub, etc.).
  Any key that has been placed in a zip and shared must be treated as compromised.

## 3. PROJECT STRUCTURE (what each group of files is)

### A. Pick 3 apps (the actual product line — HTML/JS, newest last)
- `nj_pick3_ghost_engine*.html` (v1 → v6, ~10 variants)
- `NJ_Pick3_Ghost_Engine_v7_live_sync.html` ← **most recent / most complete**
- `NJ_Pick3_Ultimate.html`, `NJ_Pick3_Ultimate_v2.html`, `NJ_Pick3_RealData_Analyzer.html`,
  `NJ_Pick3_AI_Swarm_Analyzer.html` — earlier iterations

v7 already includes: embedded historical data, tabbed UI, digit weighting,
"agents," manual result entry, bulk import, coverage/missing-date reports,
CSV export, backup/restore (localStorage), and an attempted live-fetch of
official results.

### B. Historical data
- 71 yearly CSVs: `nj-pick-3-evening-1979..2026`, `nj-pick-3-midday-2001..2026`
- `NJ_Pick3_Evening_1975_to_1979.csv` (clean format, 1,239 draws)
- Multiple combined/master files that DISAGREE with each other (see Section 4)

### C. Other projects mixed in (should be split out)
- Powerball: 9 engine HTML files + winning-numbers CSV + a PDF on draw-machine simulation
- Pick 10 CSV, Cash 4 Life CSV, NJ QuickDraw engines (2.5 MB each)
- These belong in separate repos/folders — they bloat this project.

### D. Analysis artifacts
- `NJ_Pick3_Analysis_for_MiroFish.md/.txt` — frequency analysis of 19,266 draws (1979–Mar 2017)

## 4. DATA-QUALITY FINDINGS

1. **Fireball contamination (most important).** Every draw from **2017-03-10
   onward has 4 digits** (e.g., `4-1-8-2`) — 6,581 rows. The 4th digit is the
   NJ Fireball add-on, not part of the Pick 3 number. Any frequency, pair,
   triple, or positional analysis run on the raw post-2017 data is **wrong**.
   → FIXED: `nj_pick3_canonical.csv` now stores Fireball in its own column.

2. **Header mismatch.** `header.csv` / `NJ_Pick3_MASTER.csv` claim columns
   `Date,Draw,Number1,Number2,Number3` but rows are actually
   `Date,Winning Numbers,Prize`.

3. **Conflicting combined files.** `combined_pick3.csv` (25,846 rows),
   `NJ_Pick3_MASTER.csv` (25,847), `nj_pick3_combined.csv` (20,075 — starts
   2017!), and `nj_pick3_evening_combined.csv` (**1 byte — empty/broken**).
   Four "masters" that disagree = no source of truth. → Replaced by one canonical file.

4. **Duplicates.** `NJ_Pick3_MASTER.txt` duplicates the .csv;
   `..._v4_clarified_full_history (1).html` duplicates its twin; a nested
   zip duplicates the 1975–79 CSV.

5. **Some missing prize values** (blank third column on scattered rows) — harmless.

## 5. WHAT NOW EXISTS (created during this audit)

**`nj_pick3_canonical.csv` — the new single source of truth**
- Columns: `date, draw (EVE/MID), d1, d2, d3, fireball, prize_straight`
- **26,655 validated draws: 1975-05-22 → 2026-03-22** (EVE 17,783 · MID 8,872)
- 0 malformed rows, 0 duplicate dates, 0 conflicts; Fireball correctly separated
- Merged the 1975–79 file into the main history (that data was in none of your masters)

## 6. FEATURE STATUS

| Feature | Status |
|---|---|
| Historical results explorer | Working (v7 HTML) but on contaminated data |
| Digit/pair/triple frequency | Working, but post-2017 numbers wrong until re-run on canonical data |
| Odds calculator (straight/box) | Partially present; needs a verified, tested calculation module |
| Live result sync | Attempted in v7; browser fetch to lottery sites will fail (CORS) — needs a small backend or manual entry (manual entry already works) |
| Saved numbers | Works via localStorage (per-device only, no accounts) |
| User accounts / login | Not built |
| Tests | None |
| Mobile layout | Usable but not optimized |

## 7. RECOMMENDED DEPLOYMENT STRATEGY (revised for reality)

Because the app is already HTML/JS, the cheapest path is NOT Streamlit-first:

- **Phase 1 — $0:** Clean up v7, ship it as a static site on **GitHub Pages or
  Netlify (free)**. Add a PWA manifest so iPhone users can "Add to Home Screen"
  and get an app-like fullscreen experience. No server, no rewrite.
- **Phase 2 — $0:** Add **Supabase** (free tier) directly from the HTML/JS app
  for Google login, saved numbers, and free/premium flags. Supabase's JS client
  works in a static page — Streamlit is not required for auth.
- **Phase 3 — decide later:** If you outgrow static HTML (server-side compute,
  scheduled result scraping), add a small Python/FastAPI backend — or pivot to
  Streamlit then. Only pay Apple's $99/yr and build a native wrapper
  (Capacitor/React Native) after the web version has real users.

Positioning stays as agreed: a **statistics, probability, and historical-results
analysis tool**. Recommend renaming away from "Ghost Engine" and removing
"agents predict"-style language before any store submission — Apple reviews
lottery apps strictly, and prediction claims are a rejection risk.

## 8. PRIORITIZED CHECKLIST

1. 🔴 Revoke the OpenRouter key; delete the file
2. 🔴 Adopt `nj_pick3_canonical.csv` as the only data file; archive the old masters
3. 🔴 Point v7's embedded dataset at canonical data (first 3 digits only for Pick 3 stats; Fireball as optional overlay)
4. 🟠 Split Powerball / QuickDraw / Pick 10 / Cash4Life into separate folders
5. 🟠 Extract odds math into one JS module + write test cases (straight 1/1000, box 1/167 for 3-unique, 1/333 for doubles, etc.)
6. 🟠 Deploy to GitHub Pages/Netlify; add PWA manifest + disclaimer screen
7. 🟡 Supabase auth + saved numbers
8. 🟡 Mobile polish, rename, App Store evaluation
