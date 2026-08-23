#!/usr/bin/env python3
"""
stamp_patch_copy.py — push patch/season facts from wow-patch-data.json into the HTML.

The site is static and has no build step, so patch and season numbers were typed
by hand into titles, meta descriptions, OG/Twitter cards and Schema.org blocks.
The weekly scraper updated the JSON but could not reach any of that, so the
copy Google indexes drifted a full patch and season behind the live data.

This closes the loop: wow-patch-data.json is the single source of truth, and
this script stamps it into the HTML, which is then committed like any other
change. The stamped values are real HTML, so crawlers see them without running
JavaScript — which is the whole reason this is not done client-side.

Usage:
    python3 scripts/stamp_patch_copy.py            # rewrite files in place
    python3 scripts/stamp_patch_copy.py --check    # exit 1 if anything is stale

Stdlib only, same constraint as the rest of scripts/.
"""

import glob
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "wow-patch-data.json")


def load_facts():
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    meta = data.get("_meta", {})
    season_full = meta.get("season", "")          # e.g. "Midnight Season 2"
    m = re.search(r"Season\s+\d+", season_full)
    s_tier = [k for k, v in data.get("dps_specs", {}).items() if v.get("tier") == "S"]
    return {
        "patch": meta.get("patch", ""),
        "season_token": m.group(0) if m else "",   # e.g. "Season 2"
        "season_full": season_full,
        "s_tier": s_tier,
        "premium_truth": _premium_truth(data),
    }


def s_tier_sentence(facts):
    """Rebuild the S-tier claim that appears in the tier-list FAQ and its
    Schema.org twin. It is asserted as fact to Google, so it must track the
    data rather than whatever was true the day it was written."""
    specs = facts["s_tier"]
    if not specs:
        return None
    if len(specs) == 1:
        listed = specs[0]
    else:
        listed = ", ".join(specs[:-1]) + f", and {specs[-1]}"
    return (f"In WoW Midnight {facts['season_token']}, {listed} are considered "
            f"S-tier DPS.")


# The premium quizzes hardcode a tier letter per spec, in two different shapes,
# and nothing was updating either — 22 of 39 ratings disagreed with the live
# data. They are the paid product ("spec-by-spec tier ratings"), so this is the
# drift that reached buyers.
#
# Stamped rather than fetched at runtime: it keeps three large, fragile quiz
# files free of new data-loading code, survives a failed fetch, and CI can
# prove it is correct. M+ comes from the scraped sections; raid comes from the
# curated ones.
PREMIUM_DPS = "wow-quiz-premium.html"
PREMIUM_ROLE_FILES = {
    "wow-quiz-premium-tank.html": "tank",
    "wow-quiz-premium-healer.html": "healer",
}


def _premium_truth(data):
    """spec name -> (mplus, raid) for every spec a premium quiz can show."""
    truth = {}
    specs = data.get("dps_specs", {})
    detailed = data.get("dps_specs_detailed", {})
    for name, v in specs.items():
        # dps_specs carries only the M+ tier; raid lives in the detailed section.
        truth[name] = (v.get("tier"), detailed.get(name, {}).get("raid", v.get("tier")))
    for section in ("tank", "healer"):
        for name, v in data.get(section, {}).items():
            truth[name] = (v.get("mplus"), v.get("raid"))
    return truth


def stamp_premium_dps(text, truth):
    """Shape: { name:'Assassination', mythic:'A', mplus:'A', ... } nested inside
    a class block, so the full spec key is "<spec> <class>"."""
    changes = []
    class_starts = [(m.group(1), m.start()) for m in re.finditer(r"name:'([A-Za-z ]+)', icon:", text)]
    if not class_starts:
        return text, changes
    bounds = class_starts + [("", len(text))]

    # Rebuild back-to-front so earlier offsets stay valid.
    for i in range(len(class_starts) - 1, -1, -1):
        cls, start = bounds[i]
        end = bounds[i + 1][1]
        segment = text[start:end]

        def _sub(m):
            spec, mythic, mplus = m.group(1), m.group(2), m.group(3)
            key = f"{spec} {cls}"
            if key not in truth:
                return m.group(0)
            live_mplus, live_raid = truth[key]
            if not live_mplus or not live_raid:
                return m.group(0)
            if mplus != live_mplus or mythic != live_raid:
                changes.append(f"{key} mythic {mythic}->{live_raid}, mplus {mplus}->{live_mplus}")
            return f"{{ name:'{spec}', mythic:'{live_raid}', mplus:'{live_mplus}'"

        segment = re.sub(r"\{ name:'([^']+)', mythic:'([SABC])', mplus:'([SABC])'", _sub, segment)
        text = text[:start] + segment + text[end:]
    return text, changes


def stamp_premium_role(text, truth):
    """Shape: name: 'Blood Death Knight', ... tiers: { mythic: 'A', mplus: 'B', ... }"""
    changes = []
    pattern = re.compile(
        r"(name: '([^']+)',(?:.{0,400}?)tiers: \{ mythic: ')([SABC])(', mplus: ')([SABC])(')",
        re.S,
    )

    def _sub(m):
        spec = m.group(2)
        if spec not in truth:
            return m.group(0)
        live_mplus, live_raid = truth[spec]
        if not live_mplus or not live_raid:
            return m.group(0)
        if m.group(3) != live_raid or m.group(5) != live_mplus:
            changes.append(f"{spec} mythic {m.group(3)}->{live_raid}, mplus {m.group(5)}->{live_mplus}")
        return f"{m.group(1)}{live_raid}{m.group(4)}{live_mplus}{m.group(6)}"

    return pattern.sub(_sub, text), changes


def stamp(text, facts):
    """Return (new_text, [descriptions of what changed])."""
    changes = []

    # 1. The S-tier sentence, before the generic season pass so the season
    #    inside it is rewritten as part of the regenerated sentence.
    sentence = s_tier_sentence(facts)
    if sentence:
        pat = re.compile(r"In WoW Midnight Season \d+, [^.]*? are considered S-tier DPS\.")
        def _sub(m):
            if m.group(0) != sentence:
                changes.append("S-tier sentence")
            return sentence
        text = pat.sub(_sub, text)

    # 2. Every "Season N" reference, including the JS fallbacks, so a stale
    #    default cannot resurface when the fetch fails.
    if facts["season_token"]:
        def _season(m):
            if m.group(0) != facts["season_token"]:
                changes.append(f"{m.group(0)} -> {facts['season_token']}")
            return facts["season_token"]
        text = re.sub(r"Season\s+\d+", _season, text)

    # 3. Patch fallbacks embedded in JS, e.g. (meta.patch || '12.0').
    if facts["patch"]:
        def _patch(m):
            if m.group(1) != facts["patch"]:
                changes.append(f"patch fallback {m.group(1)} -> {facts['patch']}")
            return f"meta.patch || '{facts['patch']}'"
        text = re.sub(r"meta\.patch \|\| '([\d.]+)'", _patch, text)

    return text, changes


def main():
    check_only = "--check" in sys.argv
    facts = load_facts()
    if not facts["season_token"]:
        print("ERROR: _meta.season has no 'Season N' in it — nothing to stamp")
        return 1

    print(f"Source of truth: patch {facts['patch']}, {facts['season_full']}, "
          f"S-tier = {', '.join(facts['s_tier']) or '(none)'}")

    stale = 0
    for path in sorted(glob.glob(os.path.join(REPO, "*.html"))):
        name = os.path.basename(path)
        with open(path, encoding="utf-8") as fh:
            before = fh.read()
        after, changes = stamp(before, facts)
        if name == PREMIUM_DPS:
            after, extra = stamp_premium_dps(after, facts["premium_truth"])
            changes += extra
        elif name in PREMIUM_ROLE_FILES:
            after, extra = stamp_premium_role(after, facts["premium_truth"])
            changes += extra
        if before == after:
            continue
        stale += 1
        verb = "STALE " if check_only else "stamped"
        print(f"  {verb} {name}: {'; '.join(dict.fromkeys(changes))}")
        if not check_only:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(after)

    if check_only and stale:
        print(f"\n{stale} file(s) out of date with wow-patch-data.json.")
        print("Run: python3 scripts/stamp_patch_copy.py")
        return 1
    print(f"\n{stale} file(s) {'stale' if check_only else 'updated'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
