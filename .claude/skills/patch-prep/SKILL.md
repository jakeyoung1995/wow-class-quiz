---
name: patch-prep
description: Prepare wowclassquiz.com for an upcoming WoW patch. Use when a new patch appears on PTR, when the patch-watch workflow files a "Prep window open" issue, or when the user asks to prep, draft, or stage content for an upcoming patch or season. Drafts tier and spec changes into a premium-gated preview that goes public automatically on release day.
---

# Patch prep

Turn an upcoming patch into a reviewed PR that is ready to go live the moment
Blizzard ships it.

The mechanical half is already automated. `patch-watch.yml` polls Blizzard's CDN
every 15 minutes and, on release, stamps the patch number, build, and every
title / meta / Schema.org string derived from them. **Do not hand-edit those.**

This skill covers the half that needs judgement: what actually changed for
players, and what the site should say about it.

## 1. Establish the target

```bash
python3 -c "
import sys; sys.path.insert(0,'scripts')
from update_tier_data import fetch_live_patch
for p in ('wow','wowt','wow_classic','wow_classic_ptr'):
    print(f'{p:16}', fetch_live_patch(p))
"
```

`wowt` ahead of `wow` on the minor version is the prep window. If it is not
ahead, there is nothing to prepare — say so and stop rather than inventing work.

## 2. Gather what is changing

Read, do not guess. Every claim in the draft must trace to a source.

- Wowhead news feed: `https://www.wowhead.com/news/rss/all` — filter titles for
  the target patch, "class tuning", "hotfix", "PTR"
- Icy Veins spec guides for any spec that changed — these carry the mechanics
  in prose, which is what the quiz copy needs
- Blizzard patch notes when Wowhead links them

Fetch with the shared helper so the User-Agent matches:
`from update_tier_data import fetch_tier_page`.

If a fact cannot be sourced, leave it out and note the gap. Inventing a
mechanic is worse than shipping less.

## 3. Decide what actually needs to change

Most patches need none of these. Only act on what the sources support.

| Signal | Change |
|---|---|
| New spec | Add to `dps_specs` + `dps_specs_detailed`; add to the quizzes |
| Spec reworked | Update its `specDesc` / `why` / `pros` / `cons` |
| Class gains or loses a spec | Rebalance that class's `scores` — see below |
| Season rollover | `_meta.season` (this is the one field automation cannot get) |
| Tier shifts only | Nothing — the weekly scraper already handles these |

## 4. Rebalancing scores is the dangerous part

The quizzes pick a winner by **total score**, so adding weight across several
dimensions inflates a class globally rather than repositioning it. Adding
Devourer to Demon Hunter this way once took it from winning 7.4% of outcomes to
25.5% — it would have recommended DH to a quarter of all users.

Redistribute rather than add, then verify by simulation before committing:

```js
// in the browser console on the quiz page
const qs = questions.map(q => ({id:q.id, vals:q.options.map(o=>o.val ?? o.value)}));
const total = qs.reduce((a,q)=>a*q.vals.length,1);
// exhaustively score every combination, count wins per class
```

A class's expected score should land inside the existing spread, not above it.
Check win rate too — mid-pack is correct for a newly broadened class.

Also verify every score key exists in the question vocabulary; a typo scores
zero silently.

## 5. Stage it as a premium preview

Prepared content ships behind the premium gate first and goes public
automatically on release day.

```json
"patch_preview": {
  "target": "12.2",
  "status": "preview",
  "publish_at": "2026-09-01",
  "summary": "one line for the premium banner",
  "changes": [ { "spec": "...", "note": "...", "source": "https://..." } ]
}
```

`status: preview` renders on premium pages only. `patch-watch.yml` flips it to
`live` when the patch ships.

The site is static, so preview content is fetchable by anyone who reads the
JSON directly. That matches the existing model — the unlock word is already
plaintext — but never stage anything whose leak would actually matter.

## 6. Verify, then open the PR

```bash
python3 scripts/check_site.py            # must be 0 errors
python3 scripts/stamp_patch_copy.py --check
python3 -m http.server 8901              # click through the changed pages
```

Load the changed quizzes in a browser and confirm the JS still parses and the
new content renders. A JSON edit that breaks a quiz is invisible to the
checker.

One PR per patch, targeting `main`. In the body, state what changed, link every
source, and show the before/after win rates for any rebalanced class.

## What not to do

- Do not edit `_meta.patch` or `_meta.build` — patch-watch owns them
- Do not update the premium quizzes' hardcoded `tiers:` blocks by hand; they
  are a known drift (TASKS.md Phase 5) and need migrating, not patching
- Do not merge prep content to `main` expecting it to be dormant unless it is
  behind `status: preview`
