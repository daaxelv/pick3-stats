# Jersey Cash 5 research engine

Official NJ Lottery main draws from June 29, 2020 (start of 5/45) through the snapshot's displayed last date, plus separately labeled promotional second draws. Coverage checks account for the December 25 draw holiday. Older 38/40/43 formats are outside this archive. Bullseye is inside the five numbers and applies from July 1, 2024. Official 5/5 payout > 0 identifies jackpot-paid **draws**, not ticket counts or individual claimants. Payout is retained as reported, not multiplied by an inferred number of winners.

Number and pair counts, jackpot-paid counts, 90-draw frequency, draw gaps, last dates, exact-set matches. Models scan all C(45,5) sets for their top ten, with deterministic ascending tie-breaking. Blended number weights use 60% overall appearance rate plus 40% jackpot-paid appearance rate, Laplace smoothed; this heuristic is not fitted win probability. Uniform is a seeded random comparison. Excluding prior exact sets is optional and does not improve odds. Research scores and mock wins are entertainment data.

Fixed seeded crowds: 1 to 1,000,000 agents; uniform or historically weighted choices. Draws are always uniform, independent, and assign Bullseye uniformly within the five numbers. Full-space mode computes exact counts and saves one representative per top tier with multiplicity. Base-game six-tier scoring only; XTRA is retained in real history but not simulated. Up to 1,000 mock draws, real daily calendar skipping December 25, optional stop at jackpot, deterministic seed replay.

Run settings and each announced drawing are saved before scoring. Each scored draw and all jackpot/second/third winning agent tickets are saved to browser localStorage. Reload marks running simulations interrupted and retains announced numbers. Saving failure stops processing; CSV exports include all records still in memory. UI displays the latest 1,000 wins / 500 journal entries; exports include all retained rows. IDs stay attached through sorting. Storage is per browser/device, not shared across devices. Stop terminates the worker; the saved last announced draw can be unscored.

Daily collector preserves the frozen initial current-format history and merges a trailing official year. It validates five distinct 1–45 numbers, Bullseye, XTRA, payout, schedule continuity, and conflicting dates before atomic replacement. Source publication failures leave the existing file intact. Scheduled saves use the repository concurrency-safe snapshot helper.

Run `node --test jerseycash5/*.test.mjs`.
