# NJ CASH POP history engine

Private repository feature at `/cashpop/`. No public hosting is enabled by this change.

Official first draw: #1, September 30, 2019, 05:15 Eastern, number 7. Initial verified seed: first 500 draws plus 500 recent draws. Coverage is partial until every draw ID from 1 through the collected latest endpoint is present; this does not imply real-time freshness. Summary statistics use ALL saved official batches, not just the most recent table. They include per-year and latest-500 windows, all 15 numbers, frequency share, last hit, stable ranks and reversible whole-row sorting. Year archives preserve all collected results and draw-level winners/payouts. Individual ticket prize tiers cannot be inferred from draw totals.

Run tests: `node --test cashpop/model.test.mjs` and `python3 cashpop/scripts/test_build_history.py`.
Rebuild: `python3 cashpop/scripts/build_history.py`.
Plan backfill without a browser: `node cashpop/scripts/collect_official.mjs --plan --max-batches 100`.
Official collector requires Playwright and Chromium. Run it through the CASH POP workflow. Each response is validated against the requested range (at most 500). Official results can have missing IDs: for example, #2720 returns no result, and 2501–3000 returns 499 rows. Save available rows and an explicit searched-range log; skip those known gaps when advancing the backfill. “All ranges searched” is NOT “complete history.” Remove a specific searched-range record to retry its unavailable IDs later. Valid batches survive an interrupted run; the workflow saves them, reports the failure and resumes remaining ranges next run. No simulated rows fill gaps. Scheduled collection uses a bounded budget to limit private GitHub Actions usage. Check account minutes before increasing cadence/budget.

For the initial full archive, manually select 200 batches and 6 rounds (at most 600,000 draw IDs, bounded by a 50-minute workflow timeout). Rounds stop early once all gaps are filled. If interrupted, saved verified batches remain usable and the next run resumes the gaps. Daily updates use only one 100-batch round while backfill remains incomplete.

Rules sources: https://www.njlottery.com/en-us/drawgames/cashpop.html and https://www.njlottery.com/content/dam/portal/pdfs/drawgames/cashpop/CASH-POP_Rules_effective_11.4.24.pdf
Launch source: https://njs-cdn.lotteryservices.com/content/dam/portal/pdfs/news_release_archive/2019/NJL_09-30-19_Cash-Pop.pdf
Interval change source: https://www.njlottery.com/en-us/newsandevents/newsinput/2022/press-releases/CP_IntervalChange_062122.html

Draw interval changed 15→4 minutes on June 27, 2022; raw yearly totals are not directly comparable. Historical frequency is descriptive, not improved next-draw odds. All 15 distinct choices guarantee a matching number, not net profit. This feature collects public results for private research; commercial data rights and payment eligibility remain separate launch gates.
