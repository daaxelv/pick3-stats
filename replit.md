# NJ Pick 3 Ghost Combo Engine

## Overview
A single-file, static HTML/JS web app for exploring NJ Pick 3 lottery
historical results and statistics. There is no backend and no build step —
`index.html` is the entire app. Historical draw data lives in
`data/nj_numbers_canonical.csv` (26,655 draws, 1975–2026) and is embedded
into `index.html` as a precomputed `ENGINE_DATA` JSON blob for fast loading.

**This is a statistics/history tool, not a prediction tool.** NJ Pick 3 is
pari-mutuel and drawings are random; the app must never claim to predict
winning numbers or promise fixed payouts (see `REPLIT_PROMPT.txt` rule #4).

## How to run
- Workflow "Start application" runs `node server.js`, a minimal static file
  server (no framework/build step) on port 5000.
- `data/` and the root HTML/JS files are served as-is.

## Structure
- `index.html` — the entire app (UI, engine logic, embedded historical data).
- `odds.js` — standalone odds-calculator module (straight/box odds, multi-combo
  coverage). Dependency-free; loads in the browser and in Node for tests.
- `odds.test.mjs` — automated tests for `odds.js`. Run with `node --test odds.test.mjs`.
- `data/nj_numbers_canonical.csv` — the single source of truth for historical
  draws (`game,date,draw,digits,fireball,prize_straight`). Read-only from the
  app's perspective; do not hand-edit.
- `scripts/update_results.py` + `.github/workflows/update-results.yml` — a
  GitHub Actions job (runs on GitHub, not on Replit) that is meant to fetch
  daily results and commit them. Keep this architecture as-is.
- `scripts/build_payout_stats.mjs` — regenerates the historical payout
  averages embedded in `index.html` as `PAYOUT_STATS`, from
  `data/nj_numbers_canonical.csv`. Re-run and re-paste its output into
  `index.html` whenever the canonical CSV is refreshed.
- `PROJECT_AUDIT.md`, `ROADMAP.md`, `STEP_BY_STEP_GUIDE.md`, `REPLIT_PROMPT.txt` —
  planning/audit docs from the original project bundle; `REPLIT_PROMPT.txt` is
  the authoritative 3-task work order being executed in stages.

## Status of REPLIT_PROMPT.txt work order
- **Task 1 (bug fixes) — done:** `payoutInfo()` now reports historical
  average/range payouts computed from real `prize_straight` data (labeled as
  historical averages, not guarantees) instead of fabricated fixed dollar
  amounts; the arbitrary "+bonus for digits 3/6" scoring term was removed;
  "overdue" UI language was relabeled as descriptive history ("draws since
  last hit"), never framed as prediction; `odds.js` (with `odds.test.mjs`,
  10 passing tests) implements the real fixed odds (straight 1/1,000, 6-way
  box 1/166.67, 3-way box 1/333.33, no box for triples) plus multi-combo
  cost-vs-coverage, wired into a small Odds Calculator card on the Data
  Coverage tab.
- **Task 2 (automated daily results via GitHub Actions)** and **Task 3 (MVP
  cleanup: PWA, mobile-first layout, Supabase/Stripe scaffolding)** — not yet
  started; proposed as follow-up tasks per the user's request to review Task 1
  before continuing.

## User preferences
- Work through `REPLIT_PROMPT.txt` in order, one task at a time; stop after
  each task for review before continuing.
- Build directly on the existing `index.html` — do not start a new app or
  introduce a framework.
- Never modify `data/nj_numbers_canonical.csv` except to read it.
- Keep `scripts/update_results.py` and the `.github` workflow's architecture
  (they run on GitHub, not Replit).
- Never add API keys or secrets to source code.
