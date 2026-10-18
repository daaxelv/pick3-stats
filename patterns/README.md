# Pattern Lab studies

`simulate.html` adds three study modes shared by Powerball, NY Take 5 and Millionaire for Life:

- Saved-set mock simulation freezes selected local playbook tickets.
- Pattern comparison freezes seeded portfolios; all groups face the same mock draws with the same number of unique ticket entries per drawing. Small pattern spaces reduce the budget of every group explicitly.
- Walk-forward backtesting reselects legal pattern candidates before each actual collected drawing. Up to 50 seeded candidates per pattern are ordered by summed past main-number and bonus-number frequencies; equal scores use ticket-number order. The unranked uniform baseline uses a separate seed stream. The training slice excludes the tested drawing and everything after it. Session order is Midday then Evening.

The seed streams for drawings and tickets are independent. No mode conditions drawing results on a portfolio or stops only when a desirable result appears. Current base ticket costs and payout scenarios apply throughout, including historical studies; this is not an audited record of historical cash returns. Powerball jackpot and Take 5 variable payouts remain unavailable unless supplied. M4L uses the published single-winner cash options, not lifetime annuity totals. Portfolio-owned jackpot tickets share the supplied jackpot cash assumption; outside winners and liability changes are not modeled. Take 5 free plays are separate noncash awards and are not replayed automatically.

Official prize references (checked October 18, 2026):
- https://www.njlottery.com/en-us/drawgames/powerball.html
- https://www.njlottery.com/en-us/drawgames/millionaireforlife.html
- https://nylottery.ny.gov/draw-game/?game=take5

## Recovery contract

IndexedDB database `lottery-pattern-runs-v1` owns `runs` and `steps` stores. A worker sends a prepared drawing and exact ticket portfolios; the UI commits them before acknowledging permission to score. It then commits scored results and run progress in one transaction before acknowledging permission to advance. A prepared checkpoint can be scored again deterministically after interruption. Scored checkpoints are never scored twice on resume. The original config, archive snapshot for backtests, training cutoff, seed, portfolios, all drawing numbers and all winning tickets are retained. Browser Web Locks prevent simultaneous writers across tabs. Storage errors stop the worker; no archive is silently pruned. Journal version mismatches refuse resume.

Runs and saved plays remain on the user's device. Prize rules are frozen in each run. Export compact JSON for the complete self-contained journal (fixed portfolios are stored once in `run.groups` and referenced by each drawing; backtest portfolios remain attached to their drawing), or CSV for comparisons and winning tickets. Existing engine journals and playbook keys are not altered. Closing the page releases the run lock; reopen and choose Resume. Run labels distinguish current execution from a recoverable checkpoint.

## Checks

`node --test patterns/*.test.mjs` covers all prize tiers, losses, cash/unknown/free-play accounting, equal budgets, seeded draw independence, past-only training, invalid settings, worker checkpoint ordering, pause/resume equivalence and acknowledgement gating. `python -m unittest discover -s patterns -p 'test_*.py' -v` covers Take 5 collection. The existing workflow runs the suite and syntax-checks every Pattern Lab module. Live verification should include a reload during a mock study, resumed completion, sorted reports, a historical backtest, saved-set selection and CSV/JSON export.
