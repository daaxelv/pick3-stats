# Phase 2: current results and virtual crowds

## Why the lists repeated

The old Pick 3 `estimatePlayerCounts` allocated rounded expected counts from fixed human-choice weights. It never sampled individuals. Increasing the crowd size mostly scaled the same distribution. The old linear crowd score also compressed differences between unpopular combinations because a few popular combinations dominated its range. Historical rarity and long gaps could therefore keep the same candidates near the top.

Section C selects from the rankings, and Section D repeats those 10 candidates with payout information. Overlap between sections is intentional; each section is a different view of the same run.

## Crowd behavior

- **Simulated crowd** is the default. Each virtual person makes one independent weighted choice among all 1,000 combinations. The existing choice weights are assumptions, not observed ticket sales. No new claim of measured human behavior is made.
- **Simulate new crowd / Run** creates a new sample. One sample feeds every section in an engine, including the 10-play plan. Cooldown still filters a single shared eligible pool.
- A logarithmic transform of counts makes relative differences among unpopular combos visible in the crowd component. The existing history weights and structural bonuses remain.
- **Stable estimate** uses deterministic expected counts for comparison. Its choices remain stable with unchanged inputs. Preferences are saved separately per engine.
- Changing ranking/cooldown or receiving new results reuses the current crowd. Changing the population or crowd model creates a new one. Reloading creates a fresh sample in simulation mode.
- The run summary shows the sample number and how many of the 10 combinations differ from the previous run. Some or all candidates may repeat, especially in a large population. The app never forces different picks to imply better odds.

## Feed behavior

- The existing LotteryUSA secondary source remains in use and is now labeled accurately. It is not an official NJ Lottery API.
- Collection is scheduled at minutes 23 and 53 each hour, with retries for temporary fetch failures. GitHub may delay jobs; this is a scheduled feed, not a guaranteed real-time feed.
- Each game/session is collected independently. Valid Pick 3 draws are saved even if Pick 4 or Millionaire for Life is unavailable. The workflow commits those results and status before reporting a partial failure.
- Only visible dated result-table rows are parsed. Copy/export widgets are ignored because they may disagree with the displayed table. Digits, Fireball, dates, and duplicate rows are validated; future draws are rejected.
- Existing canonical results and historical prize values are preserved. Conflicting source records are reported in `data/feed-status.json` for review instead of silently overwriting history. New draws are appended once, with atomic file replacement.
- `data/feed-status.json` records the collector timestamp, source outcomes, newest dates, recent missing dates, and the results-file hash. It is produced by the collector, never fabricated by the UI.
- The page checks the CSV/status on startup, every five minutes, and on return to the tab. It shows the newest actual results, missing dates in the previous 30 days, and the last collector check. Draw cutoffs use America/New_York with daylight-saving handling.
- Polling, manual refresh, and initial loading share one data-application path. Same-size corrections are detected; incomplete downloads cannot replace a complete cached history. Offline responses are labeled as cached. Existing manual overrides, P4/M4L, and payout data handling remain.

## Validation

Run JavaScript tests with:

```text
node --test odds.test.mjs recent-history.test.mjs cooldown.test.mjs crowd-model.test.mjs service-worker.test.mjs
```

Run collector tests with:

```text
python -m unittest discover -s scripts -p 'test_*.py' -v
```

Tests cover shared exclusions, population conservation through one million choices, seeded sampling, stable estimates, refresh behavior, partial source failures, duplicate/conflicting/malformed/future results, Eastern time cutoffs, recent gaps, and offline-cache labeling. The update workflow runs collector tests before fetching live sources. GitHub Actions provides the current collection and deployment outcomes.
