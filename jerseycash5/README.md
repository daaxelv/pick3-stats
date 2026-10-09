# Jersey Cash 5 research engine

Official NJ Lottery main draws from June 29, 2020 (start of 5/45) through the snapshot's displayed last date, plus separately labeled promotional second draws. Coverage checks account for the December 25 draw holiday. Older 38/40/43 formats are outside this archive. Bullseye is inside the five numbers and applies from July 1, 2024. Official 5/5 payout > 0 identifies jackpot-paid **draws**, not ticket counts or individual claimants. Payout is retained as reported, not multiplied by an inferred number of winners.

Number and pair counts, jackpot-paid counts, 90-draw frequency, draw gaps, last dates, exact-set matches. Models scan all C(45,5) sets for their top ten, with deterministic ascending tie-breaking. Blended number weights use 60% overall appearance rate plus 40% jackpot-paid appearance rate, Laplace smoothed; this heuristic is not fitted win probability. Uniform is a seeded random comparison. Excluding prior exact sets is optional and does not improve odds. Research scores and mock wins are entertainment data.

Fixed seeded crowds: 1 to 1,000,000 agents; uniform or historically weighted choices. Draws are always uniform, independent, and assign Bullseye uniformly within the five numbers. Full-space mode computes exact counts and saves one representative per top tier with multiplicity. Base-game six-tier scoring only; XTRA is retained in real history but not simulated. Up to 1,000 mock draws, real daily calendar skipping December 25, optional stop at jackpot, deterministic seed replay.

Run settings and each announced drawing are saved before scoring. Each scored draw and all jackpot/second/third winning agent tickets are saved to browser localStorage. Reload marks running simulations interrupted and retains announced numbers. Saving failure stops processing; CSV exports include all records still in memory. UI displays the latest 1,000 wins / 500 journal entries; exports include all retained rows. IDs stay attached through sorting. Storage is per browser/device, not shared across devices. Stop terminates the worker; the saved last announced draw can be unscored.

Daily collector preserves the frozen initial current-format history and merges a trailing official year. It validates five distinct 1–45 numbers, Bullseye, XTRA, payout, schedule continuity, and conflicting dates before atomic replacement. Source publication failures leave the existing file intact. Scheduled saves use the repository concurrency-safe snapshot helper.

Run `node --test jerseycash5/*.test.mjs`.
# Historical backtesting and Compare Models

The historical dashboard evaluates six pre-existing research models against actual
regular drawings, with ten unique tickets per model per draw. A model ranks all
1,221,759 sets once before each calendar month using all earlier regular draws,
with a minimum of 180 training draws. It holds that selection fixed throughout
the month. The first tested month can be partial, but its training cutoff still
precedes the first day of that month. Promotions and the analysis controls above
the dashboard do not affect this evaluation. There is no fixed number or exclusion
of previously drawn sets.

Windows cover the latest 90 or 365 eligible regular draws, or all eligible draws.
The uniform baseline runs 20 seeded trials, each with ten distinct sets per month
and the same actual outcomes. Trial 1 appears as a comparison row; all trials
contribute to the descriptive range and mean of ticket outcomes with 3+ matches.
This is not a significance test, an independent untouched holdout, or evidence of
a predictive advantage. Choosing a model or seed after viewing results can overfit.

Comparison reports number matches rather than financial returns: historical
prize rules and XTRA changed. Actual Bullseye is displayed when offered. Monthly
tables include training cutoff, evaluated dates, repeat selections, and match
counts. Repeats count slots also selected in the preceding tested month; unique
sets count distinct combinations across all months. Ticket-draw match counts can
include multiple hits for the same set. Completed backtests use their own browser
storage key, leaving mock journals untouched. Cancellation retains the previous
completed report. CSV export includes all summaries, monthly rows, selected sets,
3+ match details, settings and baseline totals.
