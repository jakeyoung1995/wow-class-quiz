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
