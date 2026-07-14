# STEP-BY-STEP GUIDE — From This Bundle to a Paid App

You are holding a complete project bundle. Everything referenced below is
already inside it:

```
index.html                          ← your app (v7, verified data inside)
data/nj_numbers_canonical.csv       ← 26,655 clean draws, Pick 4-ready format
scripts/update_results.py           ← automatic daily results collector
.github/workflows/update-results.yml← schedule that runs the collector
PROJECT_AUDIT.md                    ← what was found and fixed
ROADMAP.md                          ← the plan
REPLIT_PROMPT.txt                   ← paste this into Replit
STEP_BY_STEP_GUIDE.md               ← this file
.gitignore                          ← keeps secrets out of the code
```

The data file now has a `game` column (`P3` / `P4`). All 26,655 rows are P3.
When you obtain Pick 4 history, upload it to Claude and it gets merged into
the same file — the app design won't need to change.

---

## PART 1 — REPLIT (fix the app, add Pick 4 support)

1. Go to replit.com → log in → **Create App** → choose **Import from...**
   or a blank HTML/CSS/JS template (either works).
2. In the file panel (left side), click the **three-dot menu → Upload folder**
   and upload this entire bundle folder. (If folder upload isn't offered,
   use **Upload file** and add them one at a time — keep `data/`,
   `scripts/`, and `.github/workflows/` folder structure intact by creating
   those folders first with "Add folder".)
3. Open `REPLIT_PROMPT.txt`, copy ALL of it, and paste it into Replit's
   AI/Agent chat. Send it.
4. The prompt orders Replit to work in stages and STOP after Stage 1 for
   your review. Read what it reports. Reply "approved, continue" only if it
   didn't rewrite everything from scratch.
5. When Replit finishes, click **Run** and test on your phone's browser too
   (Replit gives you a temporary URL). Check: odds calculator numbers,
   results search, frequency screens, and that Pick 4 shows as
   "coming soon / data pending."
6. Do NOT pay for Replit deployment. Replit is your workshop; hosting
   happens in Part 2 for free.

---

## PART 2 — DEPLOY FREE (GitHub Pages) + AUTOMATIC DAILY UPDATES

GitHub will host the app for free AND run your results collector
automatically twice a day. One platform, both jobs.

### 2A. Put the project on GitHub
1. Create a free account at github.com.
2. Top-right **+** → **New repository**. Name: `pick3-stats`.
   Set to **Public** (required for free Pages + free Actions minutes).
   Click **Create repository**.
3. On the new repo page → **uploading an existing file** link → drag in the
   final project files FROM REPLIT (after its fixes), keeping the same
   folder layout. In Replit you can download everything via the three-dot
   menu → **Download as zip**, unzip on your computer, then drag the
   contents into GitHub.
   ⚠️ GitHub's drag-and-drop can miss the hidden `.github` folder. If so:
   in the repo click **Add file → Create new file**, type
   `.github/workflows/update-results.yml` as the filename (the slashes
   create the folders), paste the file's contents, and commit.
4. Click **Commit changes**.

### 2B. Turn on free hosting
1. In the repo: **Settings → Pages** (left sidebar).
2. Under "Build and deployment" → Source: **Deploy from a branch** →
   Branch: **main**, folder **/ (root)** → **Save**.
3. Wait ~2 minutes. Your app is now live at
   `https://YOURUSERNAME.github.io/pick3-stats/`
   That's the link you give people. Cost: $0 forever.

### 2C. Turn on the automatic results collector
1. In the repo: **Actions** tab → if prompted, click
   **"I understand my workflows, enable them."**
2. You'll see **"Update NJ lottery results"** in the list. Click it →
   **Run workflow** → **Run workflow** (green button) to test it manually.
3. Green check = it fetched the latest Pick 3 AND Pick 4 draws and
   committed them to `data/nj_numbers_canonical.csv`. Click into the run
   to see exactly which draws it added.
4. From now on it runs by itself at ~1:30 PM and ~11:30 PM Eastern daily —
   no server, no cost, nothing for you to do. The app reads the updated
   file on each page load.
5. If a run ever shows a red X, the NJ Lottery site changed its format.
   Open the error log, copy it, and paste it to Claude or Replit with:
   "fix scripts/update_results.py for this error." (The script is built to
   fail loudly instead of writing bad data.)

Note: GitHub pauses scheduled workflows if a repo has zero activity for 60
days. Any commit (even editing the README) resets the clock — your bot's
own daily commits normally keep it alive automatically.

### 2D. Make it installable on iPhones (PWA)
Replit's Stage 3 adds a manifest + icons. Once live, iPhone users open your
link in Safari → Share button → **Add to Home Screen** → the app gets its
own icon and opens fullscreen like a real app. Put a one-line instruction
banner in the app saying exactly that.

---

## PART 3 — MONETIZATION (login + payments, no Apple, no fees upfront)

Model: free tier (odds calculator, basic history) + premium tier
(full analysis, saved numbers, Pick 4, crowd-avoidance engine).
You keep ~97% of revenue vs. 70–85% through Apple.

### 3A. Supabase — accounts & saved numbers (free tier)
1. Create a free account at supabase.com → **New project** → name it,
   set a strong database password (save it), pick the US East region.
2. In the dashboard: **Authentication → Providers** → enable **Email** and
   **Google** (Google requires creating OAuth credentials at
   console.cloud.google.com — Supabase's docs page linked right there walks
   through it in ~10 minutes).
3. **Table Editor → New table** → name `saved_numbers`, columns:
   `id` (uuid, primary), `user_id` (uuid), `game` (text), `combo` (text),
   `note` (text), `created_at` (timestamp, default now()).
4. **New table** → `profiles`: `user_id` (uuid, primary), `email` (text),
   `is_premium` (boolean, default false).
5. Turn ON **Row Level Security** on both tables and add the policy
   "users can only read/write rows where user_id = auth.uid()" (Supabase
   offers this as a template — one click).
6. **Settings → API** → copy the Project URL and the `anon public` key.
   These two values are SAFE to put in your app's code (they're designed
   for browsers; the row-level security is what protects data). Never copy
   the `service_role` key anywhere.
7. Give the URL + anon key to Replit with:
   "Wire up Supabase auth and saved numbers using these values, following
   the premium-gating structure you prepared in Stage 3."

### 3B. Stripe — payments
1. Create an account at stripe.com (free; they take ~2.9% + 30¢ per charge).
2. Complete business verification (can be as an individual/sole prop).
3. **Product catalog → Add product** → "Premium Access" → set price
   (e.g., $4.99/month recurring, or a one-time price — start with monthly).
4. Easiest integration, zero code: **Payment Links** → create a link for the
   product → in the link settings, set the after-payment redirect to
   `https://YOURUSERNAME.github.io/pick3-stats/?upgraded=1`.
5. Connecting payment → premium flag: the simple manual way to start is
   Stripe emails you on each sale → you flip `is_premium` to true for that
   email in Supabase (Table Editor, 5 seconds). Automate later with a
   Supabase Edge Function listening to Stripe webhooks — ask Replit/Claude
   for that once you have real customers. Don't build automation for
   customers you don't have yet.
6. Legal hygiene for a lottery-adjacent paid product: show the disclaimer
   at signup ("statistics tool, does not predict outcomes, no refunds for
   lottery losses"), require 18+ checkbox, and state it's for NJ game
   information. Simple terms-of-use page linked in the footer.

### 3C. Optional later: custom domain
~$12/yr at any registrar → point it at GitHub Pages (Settings → Pages →
Custom domain). `pick3stats.com` looks more trustworthy on a payment page
than a github.io address. This is the ONLY cost in the whole stack until
Supabase/Stripe free tiers are outgrown (thousands of users).

---

## PART 4 — PICK 4 DATA
The app, data format, odds module, and auto-collector are all Pick 4-ready.
The only missing piece is Pick 4 HISTORY (the collector only grabs new
draws going forward — it starts building P4 history from the day you turn
it on). To backfill: get yearly Pick 4 CSVs from the same source you used
for Pick 3, upload them to Claude, and they'll be validated and merged into
nj_numbers_canonical.csv the same way. Until then the app shows Pick 4 with
"history building since <date>" using the auto-collected draws.

---

## ORDER OF OPERATIONS (your checklist)
1. ✅ OpenRouter key deleted (done)
2. Upload bundle to Replit → paste REPLIT_PROMPT.txt → review each stage
3. Download finished project from Replit → upload to GitHub
4. Enable GitHub Pages (2B) → app is live
5. Enable and test the Actions workflow (2C) → data updates itself
6. Share the link, get 10–20 real users, watch what they use
7. Add Supabase login (3A) when people ask to save numbers
8. Add Stripe (3B) when you have users who'd pay
9. Backfill Pick 4 history whenever you find the CSVs
10. Revisit App Store only if the web app proves demand
