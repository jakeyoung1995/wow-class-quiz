# WoW Class Quiz — Project Reference

> **This repo is public**, and every file in it is served from wowclassquiz.com.
> Assume anything committed here is readable by anyone.
>
> Business context — traffic, revenue, conversion, keyword rankings, unlaunched
> plans — lives in `NOTES.md`, which is gitignored and local-only. Read it when you
> need that context; never move its contents into a tracked file.
>
> Credentials live in `.env` (gitignored) and GitHub Actions secrets. See
> `MAC-SETUP.md` for setting up a second machine.

## Project Overview

A static HTML website that helps WoW players choose their class through interactive quizzes. Covers WoW Midnight (retail) and WoW Classic (Vanilla, with Classic Plus support planned). Currently monetized via a $6.99 Gumroad premium bundle and (planned) affiliate links.

---

## Site Config

| Key | Value |
|-----|-------|
| Live URL | https://wowclassquiz.com |
| GitHub repo | https://github.com/jakeyoung1995/wow-class-quiz |
| GitHub user | jakeyoung1995 |
| GitHub token | **Stored in `.env` (gitignored).** Never commit. Rotate via github.com/settings/tokens. |
| Gumroad product | https://jynova2.gumroad.com/l/yejhos |
| Premium unlock word | <UNLOCK_WORD> |
| Notify email | <NOTIFY_EMAIL> |

**Working copies**: see `NOTES.md` (local, gitignored).

**To push updates**: open a pull request. See [Deployment](#deployment) below.
`deploy.py` is the legacy path and is being retired — it pushes straight to `main`
through the Contents API, which leaves no review step and desynchronises local git
history from the remote.

---

## Site Structure

### Pages
| File | Description |
|------|-------------|
| `index.html` | Homepage — hero with above-fold CTA, Midnight/Classic toggle, role cards, More Tools row, FAQ |
| `wow-quiz-free.html` | Free DPS quiz (9 questions, 13 classes — includes Shadow Priest) |
| `wow-quiz-tank.html` | Free Tank quiz (9 questions, 6 specs) |
| `wow-quiz-healer.html` | Free Healer quiz (9 questions, 7 specs) |
| `wow-quiz-premium.html` | Premium DPS quiz (30 questions, deep analysis) |
| `wow-quiz-premium-tank.html` | Premium Tank quiz (30 questions) |
| `wow-quiz-premium-healer.html` | Premium Healer quiz (30 questions) |
| `wow-quiz-premium-hub.html` | Premium hub — links all Midnight premium quizzes + Classic |
| `classic-hub.html` | Classic WoW hub (Vanilla; will expand for Classic Plus when released) |
| `classic-quiz-free.html` | Free Classic quiz — single quiz covering all 9 Vanilla classes across roles |
| `classic-quiz-premium.html` | Premium Classic quiz (25 questions) |
| `selector.html` | Class selector — browseable grid of all 13 classes with role filter |
| `tier-list.html` | Midnight class tier list — renders dynamically from `wow-patch-data.json`, M+/Raid dimension toggle, email signup for tier-shift alerts |
| `team-comp-builder.html` | NEW — M+ team comp builder. 5 slots, auto-scores tier + utility + bloodlust + battle rez |
| `gear.html` | NEW — single curated affiliate gear page. SEO-targets "best mouse/keyboard/monitor for WoW". Replaces per-class affiliate logic. Updated quarterly when hardware changes. |
| `404.html` | Custom 404 page |

### Supporting files
| File | Description |
|------|-------------|
| `wow-patch-data.json` | Live tier data. Now also contains `dps_specs_detailed`, `tank_specs_detailed`, `healer_specs_detailed` for premium quizzes (future migration target) |
| `deploy.py` | Push script — reads `GH_TOKEN` from `.env`, deploys via GitHub Contents API. Also deletes orphan files from remote on each run |
| `.env.example` | Template — copy to `.env` and fill in your token |
| `scripts/update_tier_data.py` | Weekly tier scraper. NEW: also fetches subscriber list from Apps Script and emails tier-shift notifications |
| `scripts/affiliate-tools.js` | Shared "My WoW gear" CTA renderer for results pages. Now just points to `/gear.html` — the single source of truth for affiliate recommendations. |
| `scripts/apps-script-template.gs` | Reference template for the Google Apps Script backend (feedback + subscribers + tier-script GET endpoint) |
| `.github/workflows/update-tier-data.yml` | Runs the scraper every Monday |
| `.github/workflows/pr-checks.yml` | Runs `scripts/check_site.py` on every PR and every push to `main` |
| `scripts/check_site.py` | Pre-flight validation — broken links, truncated HTML, duplicate GA4, sitemap drift, malformed tier JSON, committed secrets. Stdlib only. Run it before you push. |
| `sitemap.xml` | 14 pages (orphan classic tank/healer removed) |
| `robots.txt` | Points to sitemap |
| Favicons | `favicon.ico` (multi-size), `favicon.svg`, `favicon-48.png`, `favicon-96.png`, `apple-touch-icon.png`, `icon-192.png` |
| OG images | `og-main.jpg`, `og-preview.jpg`, `og-tank.jpg`, `og-healer.jpg` |
| `CNAME` | Custom domain: wowclassquiz.com |
| `TASKS.md` | Outstanding work tracker — read this for what's done / pending |

---

## Architecture

### Hosting
- **GitHub Pages** on `main` branch — deploys automatically on push
- Custom domain via CNAME

### Deployment

**Current path — git + pull requests.** GitHub Pages builds from `main`, so
merging a PR is the deploy. There is no separate publish step.

```bash
git checkout main && git pull          # always start from current main
git checkout -b fix/short-description  # one branch per change
# ...edit files...
python3 scripts/check_site.py          # must print "0 error(s)" before you push
git add -A && git commit -m "fix: ..."
git push -u origin HEAD
gh pr create --fill                    # or open the PR from the URL git prints
```

Merging the PR deploys to https://wowclassquiz.com within about a minute.
Hard-refresh (`Cmd/Ctrl+Shift+R`) to get past browser cache.

Every PR runs `.github/workflows/pr-checks.yml`, which executes
`scripts/check_site.py` — the same command you run locally. It fails the build on
broken internal links, truncated HTML, duplicate or missing GA4 tags, sitemap
drift, malformed `wow-patch-data.json`, and anything that looks like a committed
credential.

To preview locally before pushing:

```bash
python3 -m http.server 8901
```

**Legacy path — `deploy.py`.** Still works, but prefer the PR flow. It reads
`GH_TOKEN` from `.env` and PUTs each file through the GitHub Contents API.
- Files declared in `FILES` array; scripts in `EXTRA` as (local_path, remote_path) tuples
- `REMOVED_FILES` triggers DELETE for files that should no longer live on remote
- Cannot push from the Linux sandbox (403 proxy) — must run `python deploy.py` locally
- Because it bypasses git, your local clone drifts out of date after every run.
  That drift is the main reason to stop using it.

### Live Tier Data Pipeline
1. GitHub Actions runs `scripts/update_tier_data.py` every Monday at ~9am UTC
2. Discovers Icy Veins tier-list URLs from their hub page (resilient to URL renames)
3. Falls back to `ICYVEINS_FALLBACK_URLS` if hub scrape fails
4. Parses S/A/B/C rankings and updates `wow-patch-data.json`
5. Diffs old vs new; if tier shifts detected:
   - Commits + pushes to `main` (GitHub Pages auto-deploys)
   - Emails the admin (<NOTIFY_EMAIL>) via Gmail SMTP
   - **NEW**: fetches subscribers from Apps Script via `SUBSCRIBER_FETCH_URL` and sends each one a styled tier-shift email
6. Structural changes (new specs) open a GitHub Issue instead of auto-committing

### Premium Tier Data
- `wow-patch-data.json` includes `dps_specs_detailed` / `tank_specs_detailed` / `healer_specs_detailed` with per-spec metrics (complexity, mobility, aoe, single_target, mplus, raid, etc.)
- The premium quizzes still embed similar data in HTML; future work is to fully migrate them to consume the JSON (so weekly hotfix changes propagate to premium results). Tracked in TASKS.md Phase 5.

### Feedback + Email signup
- Same Google Apps Script endpoint handles both. Template lives at `scripts/apps-script-template.gs`.
- Posts: `{type: 'feedback', ...}` for star ratings, `{type: 'subscribe', email}` for tier-shift signup
- GET: `?action=list_subscribers&key=<SECRET>` returns the email list for `update_tier_data.py` to consume

### Analytics & SEO
- GA4 ID: `G-YMTTK4WJ3F` — on all pages
- Schema.org: `SoftwareApplication`, `WebSite`, `FAQPage` on index; `FAQPage` on selector + tier-list; `WebApplication` on team-comp-builder
- **Removed**: fabricated `aggregateRating` (was risk for Google manual action)
- `<meta name="application-name">` on index — keeps Google SERP showing site name

---

## Monetization

How it works in the code. Pricing strategy, revenue and conversion figures live
in `NOTES.md` (local, gitignored) — this repo is public.

- **Free quizzes**: 9 questions, role-based result with class cards
- **Pro**: one-time purchase on Gumroad covering all deep-dive quizzes plus every
  future quiz. Price is stamped across the site; `check_price_consistency` in
  `scripts/check_site.py` fails the build if any page disagrees.
- Access is a per-sale Gumroad licence key verified in the browser via
  `POST /v2/licenses/verify` — no backend, no access token needed. The legacy
  shared unlock word still works indefinitely for pre-Pro buyers.
- Checkout opens in Gumroad's overlay on-site. The Pro CTA first asks whether the
  visitor is buying or already has a key (`scripts/pro-access.js`).
- Affiliate links render through `scripts/affiliate-tools.js`; the tracking tag is
  set in that file.

---

## Design System

| Token | Value |
|-------|-------|
| Background | `#0a0800` |
| Surface 1 | `#110f08` |
| Surface 2 | `#1a1810` |
| Surface 3 | `#222018` |
| Border | `#2e2a1e` |
| Gold | `#d4aa52` |
| Gold light | `#f0cc70` |
| Text | `#f0e8d8` |
| Text muted | `#b0a080` |
| DPS color | `#d4aa52` |
| Tank color | `#6090d8` |
| Heal color | `#58c878` |

Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
Header: sticky, 56px, crossed swords SVG + nav (DPS, Tank, Healer, Tier List, Team Comp, Classic, Premium)

---

## Known issues / watch-outs

- **Never use `typeof varName` before a `const varName`** in the same function scope — throws a TDZ ReferenceError. All `showResults()` functions must declare `const ranked = calcScores()` BEFORE any gtag call. (Tank + Healer free quizzes had this bug pre-May-2026; fixed.)
- **Premium quiz tier letters are still hardcoded in HTML.** The JSON has `dps_specs_detailed` etc. ready for consumption; full migration is in TASKS.md.
- **Unlock word is in plain HTML** — no real anti-piracy. Acceptable tradeoff for the buyer UX win of cross-device access.
- **`deploy.py` cannot run from the sandbox** — GitHub API returns 403 through the proxy. Always run locally. Prefer the PR flow instead; it works from any machine with git.
- **Run `python3 scripts/check_site.py` before every push.** It catches the exact bug classes this repo has shipped before: truncated HTML, links to deleted pages, duplicate GA4 tags.
- **`update_tier_data.py` requires `GMAIL_APP_PASSWORD` GitHub secret** for emails to send. Get via myaccount.google.com/apppasswords on <NOTIFY_EMAIL>.
- **`SUBSCRIBER_FETCH_URL` + `SUBSCRIBER_FETCH_KEY` GitHub secrets** needed for tier-shift subscriber emails to work.
- **Google favicon delay**: 1–2 weeks after deploy. Normal.
- **Browser cache**: hard-refresh (`Ctrl+Shift+R`) after deploys.

---

## SEO

Mechanics only. Ranking positions, keyword targets and traffic figures are in
`NOTES.md` (local, gitignored).

- `sitemap.xml` is generated-adjacent: `scripts/update_sitemap.py` derives every
  `<lastmod>` from that file's last git commit, and CI fails if any drift. Needs
  `fetch-depth: 0` on checkout to work.
- Patch and season strings, the S-tier sentence, and premium tier letters are all
  stamped from `wow-patch-data.json` by `scripts/stamp_patch_copy.py`. Never hand-edit
  them; run the stamper.
- GA4 measurement ID `G-YMTTK4WJ3F`. Custom event parameters must be registered as
  custom dimensions in GA4 before they can be used as breakdowns, and registration
  is not retroactive.
- Schema.org `FAQPage` blocks must match the visible FAQ copy — Google expects
  them to agree, so change both together.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-28 | Project started |
| 2026-05-04 | Classic quizzes + hub launched |
| 2026-05-04 | Tier badge system + wow-patch-data.json + GitHub Actions auto-updater |
| 2026-05-05 | Premium quizzes expanded 20→30 questions (Midnight); 25 questions (Classic) |
| 2026-05-06 | New favicon set, selector + tier-list pages, schema markup |
| 2026-05-11 | Icy Veins scraper URL fix + dynamic URL discovery |
| 2026-05-11 | Tank rankings updated per hotfixes |
| 2026-05-12 | Favicon SERP upgrade + GA4 + Classic showResults fixes |
| 2026-05-12 | **Full review + Phase 1–5 improvements pass** — see TASKS.md for the full punch list. Highlights: token rotation, 20→30 question copy fix, fake aggregateRating removed, hero CTA, M+ Team Comp Builder built, Shadow Priest added, Vengeance retuned A/A, affiliate Tools section, tier-shift email automation, orphan files deleted, Apps Script template documented |
| 2026-08-28 | Price raised $1.99 → $6.99 across 19 places incl. the Schema.org Offer; `check_price_consistency` added so the site cannot advertise two prices |
| 2026-08-23 | Adopted git + pull-request workflow as the deploy path (`deploy.py` deprecated); added `scripts/check_site.py` + `pr-checks.yml` CI; fixed 4 dead links to the deleted Classic tank/healer quizzes and removed duplicate GA4 tags that were double-counting pageviews on the free tank + healer quizzes |
| 2026-08-23 | Second-machine setup documented (`MAC-SETUP.md`) + redacted `docs-public/` copies of CLAUDE.md and TASKS.md published to the public repo via new `publish-docs.py`; three orphan 8.3 short-name premium files (`WO0B2D~1.HTM`, `WOB48C~1.HTM`, `WOEE1A~1.HTM`) added to `REMOVED_FILES` — they were serving paid premium content for free |
