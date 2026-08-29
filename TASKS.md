# WoW Class Quiz — Improvement Tasks

> **Public copy.** Secrets are redacted as `<PLACEHOLDERS>`.

Tracking everything from the May 2026 review. **Phase 1–5 complete.**

---

## ✅ Phase 1 — Critical fixes (done)

- [x] GitHub token moved out of `deploy.py` to `.env` (still requires user to rotate exposed token — see below)
- [x] Premium DPS quiz copy fixed: "20 Questions" → "30 Questions" (badge, feature pill, progress bar)
- [x] "Section 3: Identity & Lore" label added to premium quizzes for Q21–30
- [x] Fabricated `aggregateRating` schema removed from `index.html`
- [x] `deploy.py` walrus double-push bug fixed
- [x] Tank + Healer free quiz `showResults()` GA4 bug fixed (`ranked` was undefined)
- [x] `update_tier_data.py` operator precedence bug fixed (line ~80)
- [x] `update_tier_data.py` email mismatch fixed (docstring vs. code)
- [x] `tier-list.html` "Patch 12.0" eyebrow now reads patch from JSON dynamically
- [x] **Repaired truncated quiz files** — all 6 quiz HTML files were truncated mid-`initFeedbackWidget`; restored full function + closing tags. (This was probably silently breaking the feedback widget on the live site.)

## ✅ Phase 2 — Content fixes (done)

- [x] Shadow Priest added to DPS quiz (now 13 classes)
- [x] Vengeance DH retuned in JSON (B/B → A/A) — closer to current meta
- [x] Augmentation Evoker copy updated to clearly call out support-DPS framing
- [x] DPS Q1 "Either works for me" → "Flexible — show me both"
- [x] `dps_specs_detailed` / `tank_specs_detailed` / `healer_specs_detailed` added to `wow-patch-data.json` (premium quizzes can consume in a follow-up migration)
- [x] `tier-list.html` now shows both M+ and Raid tiers for tanks/healers via dimension toggle

## ✅ Phase 3 — Flow / UX (done)

- [x] Above-fold "Start the Free Quiz →" CTA added to `index.html`
- [x] Premium banner removed from homepage; replaced with a "More Tools" row (Tier List, Team Comp Builder, Class Selector)
- [x] Selector + Tier List + Team Comp Builder promoted into nav header (replacing one-purpose Premium link)
- [x] Feedback widget moved from top to bottom of all 3 free results pages
- [x] Affiliate "Tools I recommend" section added to free DPS / Tank / Healer results pages
- [x] Unlock-word input added to every premium gated page (`wow-quiz-premium.html`, premium-tank, premium-healer)
- [x] Email signup section added to `tier-list.html`
- [x] Orphan `classic-quiz-tank.html` + `classic-quiz-healer.html` deleted
- [x] `sitemap.xml` updated to remove deleted classic files + add team-comp-builder

## ✅ Phase 4 — New features (done)

- [x] M+ Team Comp Builder built (`team-comp-builder.html`) — 5 slots, auto-scores tier + utility, copy-share URL
- [x] Tier-shift email automation added to `update_tier_data.py` — fetches subscribers, sends styled HTML email when JSON changes
- [x] Apps Script template documented at `scripts/apps-script-template.gs`

## ✅ Phase 5 — Refactor + cleanup (done)

- [x] `scripts/affiliate-tools.js` shared module created
- [x] `reddit-posts.md` deleted (stale, referenced $5 / 20 questions / netlify URL)
- [x] `LAUNCH-CHECKLIST.md` deleted (stale)
- [x] `CLAUDE.md` rewritten to reflect current state + changelog entry
- [x] **Deferred**: full migration of premium quiz tier letters from hardcoded HTML to JSON consumption (data is in JSON, ready when you have time)

---

## 🚨 Things you (Jake) need to do — read this carefully

These cannot be done from inside Cowork. In priority order:

### IMMEDIATE — Do today

1. **🔥 ROTATE THE EXPOSED GITHUB TOKEN.**
   The token `<REVOKED_TOKEN>` was in `deploy.py` git history and in `CLAUDE.md` for who knows how long. Steps:
   - Go to https://github.com/settings/tokens
   - Delete the token starting `<REVOKED_TOKEN_PREFIX>…`
   - Generate a new token with `repo` scope
   - Create `the Windows working copy's `.env`` with one line:
     ```
     GH_TOKEN=ghp_yournewtoken
     ```
   - `.gitignore` already excludes `.env`
   - The new `deploy.py` reads this automatically
2. **Run `python deploy.py` locally** to push all my changes to GitHub Pages. Verify https://wowclassquiz.com loads correctly after ~1 minute.

### This week

3. **Sign up for Amazon Associates** at https://affiliate-program.amazon.com. Once approved, send me your tracking ID (looks like `wowclassquiz-20`) and I'll update `scripts/affiliate-tools.js` `AFFILIATE_TAGS.AMZ_TAG`. The Amazon links in the Tools section currently use the placeholder tag and will redirect but won't track sales until you set this.
4. **Check Raider.IO for affiliate program** at https://raider.io/affiliate or in their support docs. If they offer one, send the URL/ref code and I'll wire it in.
5. **Optional: Wowhead Premium affiliate** — check https://www.wowhead.com/premium or their footer. If they have a program, send the link.

### Deploy the Google Apps Script for email subscribers + tier-shift alerts

Right now the subscription form on tier-list.html will POST emails, but nothing reads them or sends tier-shift mail yet. To enable:

6. **Set up the Apps Script backend** using the template at `scripts/apps-script-template.gs`:
   - Open https://script.google.com → New project → name it "WoW Class Quiz Backend"
   - Open the existing project that already handles feedback (the one with the URL `<APPS_SCRIPT_ID>…/exec`) and either replace its `Code.gs` with the new template or paste in just the new `handleSubscribe` / `handleUnsubscribe` / `listSubscribers` / `doGet` functions and constants.
   - Create a Google Sheet to back it — copy its Sheet ID into the `SHEET_ID` constant
   - Set `SECRET_KEY` to a random string (use any password generator)
   - Deploy → New deployment → Web App → Execute as: Me → Who has access: Anyone
   - Copy the Web App URL
7. **Add three new GitHub Secrets** at https://github.com/jakeyoung1995/wow-class-quiz/settings/secrets/actions:
   - `GMAIL_APP_PASSWORD` — already needed; get from myaccount.google.com/apppasswords on <NOTIFY_EMAIL> (skip if already set)
   - `SUBSCRIBER_FETCH_URL` — set to: `<your apps script web app url>?action=list_subscribers`
   - `SUBSCRIBER_FETCH_KEY` — set to the same `SECRET_KEY` value you put in the Apps Script
   - Without these, the tier shift emails will silently no-op (but the rest of the scraper still works).

### Discussions / things we decided to skip

8. **Ads — skipped.** Agreed with your traffic-based concern. Revisit at 5,000+ monthly sessions.
9. **PDF guides — skipped.** Too much maintenance per patch.
10. **Patreon / email lists — skipped beyond the tier-shift alert.** Tier-shift alerts are automated and require zero ongoing effort, so they're a fit. Anything heavier we'll revisit.
11. **WeakAuras / Plater profiles — skipped** per your call about the API change.
12. **SoD / Hardcore / other Classic flavors — skipped** in anticipation of Classic Plus. The Classic hub language is unchanged so it still reads as "Vanilla" for now.

---

## Future / deferred (no rush)

- Full migration of premium quiz tier-letter rendering to consume `*_specs_detailed` from `wow-patch-data.json`. Data is already in JSON; the HTML cards still embed similar data. Migrating means weekly hotfix changes propagate to premium results too. Skipping now to keep the change surface small.
- Extract shared CSS + quiz engine to `/styles/quiz.css` and `/scripts/quiz-core.js` — would dedupe ~80% of code across 10 quiz HTML files. Not blocking but pays off the next time you do a major design refresh.
- Add a Classic Plus hub once Blizzard announces details.
