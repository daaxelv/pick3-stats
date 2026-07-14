# NJ Pick 3/4 Ghost Combo Engine

## Overview
A single-file, static HTML/JS web app for exploring NJ Pick 3 (and, once
backfilled, Pick 4) lottery historical results and statistics. There is no
backend and no build step — `index.html` is the entire app, installable as
a PWA (Add to Home Screen on iPhone/Android). It loads
`data/nj_numbers_canonical.csv` (26,655 draws, 1975–2026) live from its own
origin at page load and computes all stats fresh from that file; an
embedded snapshot (`FALLBACK_ENGINE_DATA`/`FALLBACK_PAYOUT_STATS`) is used
only if that fetch fails.

**This is a statistics/history tool, not a prediction tool.** NJ Pick 3 is
pari-mutuel and drawings are random; the app must never claim to predict
winning numbers or promise fixed payouts (see `REPLIT_PROMPT.txt` rule #4).

## How to run
- Workflow "Start application" runs `node server.js`, a minimal static file
  server (no framework/build step) on port 5000.
- `data/` and the root HTML/JS files are served as-is.

## Structure
- `index.html` — the entire app (UI, engine logic, live CSV loader, PWA
  registration). `FALLBACK_ENGINE_DATA`/`FALLBACK_PAYOUT_STATS` are the
  embedded offline snapshot; `ENGINE_DATA`/`PAYOUT_STATS` (mutable) hold
  whichever is currently active (live CSV or fallback).
- `odds.js` — standalone odds-calculator module for both games: Pick 3
  (straight/box odds, multi-combo coverage) and Pick 4 (`*P4`/`*4` variants:
  straight 1/10,000, 24-/12-/6-/4-way box). Dependency-free; loads in the
  browser and in Node for tests.
- `odds.test.mjs` — automated tests for `odds.js` (21 tests, Pick 3 + Pick 4).
  Run with `node --test odds.test.mjs`.
- `data/nj_numbers_canonical.csv` — the single source of truth for historical
  draws (`game,date,draw,digits,fireball,prize_straight`; `game` is `P3` or
  `P4`). Read-only from the app's perspective; do not hand-edit. Currently
  all rows are `P3` — the Pick 4 tab shows "history building" until backfill
  data is added, and will auto-populate once it is (no code changes needed).
- `scripts/update_results.py` + `.github/workflows/update-results.yml` — a
  GitHub Actions job (runs on GitHub, not on Replit) that fetches daily
  results for both games and appends/commits them to the canonical CSV. Keep
  this architecture as-is.
- `scripts/build_payout_stats.mjs` — reference implementation for the payout
  average/range math; the same logic now also runs live in the browser
  (`buildPayoutStatsFromRows` in `index.html`).
- `manifest.webmanifest`, `service-worker.js`, `icons/`, `favicon.ico` — PWA
  support (installable "Add to Home Screen", offline app shell via a
  cache-first service worker; the results CSV itself is fetched network-first
  so stats stay fresh).
- `PROJECT_AUDIT.md`, `ROADMAP.md`, `STEP_BY_STEP_GUIDE.md`, `REPLIT_PROMPT.txt` —
  planning/audit docs from the original project bundle; `REPLIT_PROMPT.txt` is
  the original 3-task work order (Task 2's architecture was overridden by the
  user to load the canonical CSV directly instead of a separate `results.json`).

## Status of REPLIT_PROMPT.txt work order
- **Task 1 (bug fixes) — done:** real historical average/range payouts
  instead of fabricated fixed amounts; arbitrary digit-bonus scoring removed;
  "overdue" relabeled as descriptive history; `odds.js` Pick 3 odds + tests.
- **Task 2 (automated daily results) — done:** the app fetches
  `data/nj_numbers_canonical.csv` live from its own origin at load (no CORS
  proxy); GitHub Actions keeps that file current. Falls back to an embedded
  snapshot if the fetch fails.
- **Task 3 (MVP cleanup) — done:** PWA manifest + icons + service worker (Add
  to Home Screen, offline app shell); mobile-first layout polish (44px touch
  targets, scrollable tab bar, safe-area insets, small-screen type scale);
  persistent responsible-use disclaimer/helpline footer on every screen; a
  Pick 4 tab (odds calculator now, history once backfilled) with `odds.js`
  Pick 4 odds + tests; data-source/freshness notice on the Data Coverage tab.
- Not yet built (explicitly deferred, per `REPLIT_PROMPT.txt`): Supabase
  login and Stripe payments/premium gating — the code should stay structured
  so these can be added without a rewrite, but nothing here should be assumed
  to exist yet.

## User preferences
- Work through `REPLIT_PROMPT.txt` in order, one task at a time; stop after
  each task for review before continuing.
- Build directly on the existing `index.html` — do not start a new app or
  introduce a framework.
- Never modify `data/nj_numbers_canonical.csv` except to read it.
- Keep `scripts/update_results.py` and the `.github` workflow's architecture
  (they run on GitHub, not Replit).
- Never add API keys or secrets to source code.
