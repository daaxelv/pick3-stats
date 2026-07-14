# ROADMAP — NJ Pick 3 Stats & Odds App

Positioning (fixed, all phases): a Pick 3 statistics, probability, and
historical-results analysis tool. Every screen states that drawings are random,
history does not predict future results, and the app sells nothing and takes no
wagers. No "guaranteed winners," no "AI knows the next number."

## Phase 0 — Security & housekeeping (do first, ~1 hour)
- Revoke the exposed OpenRouter API key; delete `OPENROUTER KEY.txt`
- Create a `.gitignore` (secrets, .env, backups)
- Split non-Pick-3 projects (Powerball, QuickDraw, Pick 10, Cash4Life) into their own folders

## Phase 1 — Data foundation (done / verify)
- ✅ Canonical dataset built: `nj_pick3_canonical.csv` — 26,655 draws, 1975–2026,
  Fireball separated, zero malformed rows
- Re-run all frequency/pair/triple stats on the canonical data (post-2017 stats were contaminated by the Fireball digit)
- Add a tiny update script or in-app manual entry for new daily results

## Phase 2 — Repair & verify the calculation engine
- Take `NJ_Pick3_Ghost_Engine_v7_live_sync.html` as the base
- Extract odds math into one module; verify exact probabilities:
  straight 1/1,000 · 6-way box 1/166.67 · 3-way box (double) 1/333.33 · triple 1/1,000
- Combination analyzer: unique / double / triple classification
- Write automated test cases for every formula

## Phase 3 — Clean MVP (static web, $0)
- Single polished HTML app (or small JS project): Odds Calculator, Results
  Explorer (search by date/number/draw), Frequency Analysis (with Fireball
  toggle OFF by default), Combination Analyzer, Data-source & last-updated
  notice, Responsible-use notice
- Deploy free: GitHub repo → GitHub Pages or Netlify
- Add PWA manifest + icons → iPhone "Add to Home Screen" gives an app-like experience

## Phase 4 — Accounts & saved numbers
- Supabase (free tier): Google sign-in, saved combinations + notes,
  free vs. premium flag
- Never build a homemade password system

## Phase 5 — Feedback loop
- Share the link with test users; log which features get used
- Decide from real usage whether premium features justify payments (Stripe later)

## Phase 6 — Mobile / App Store (only after web traction)
- Option A (default): stay a PWA — $0, no review risk
- Option B: wrap with Capacitor or rebuild UI in React Native/Expo, keeping the
  same calculation module; budget Apple Developer $99/yr
- Pre-submission: rename away from "Ghost Engine," strip prediction language,
  add age/jurisdiction notice — Apple reviews lottery-related apps strictly

## Phase 7 — Second product
- Resume BuyBizDealBuilder as a separate repo once Pick 3 MVP is live
