#!/usr/bin/env python3
"""
forever_phase.py — keep the WoW Forever "where are we" strings true by date.

The Forever pages say things like "Beta · Launches Nov 4" in half a dozen
places. Those were true on 2026-09-26 and become lies on 2026-10-21 (beta
ends), 2026-11-04 (launch) and 2026-12-09 (first raids). Nobody should have to
remember to edit six pages on a Wednesday evening, so this derives the phase
from the dates in scripts/forever-data.js and stamps the strings between
sentinel comments. A daily GitHub Action runs it and commits the flip.

Phases, from META dates:
    beta       today <  betaEnd
    prelaunch  betaEnd <= today < launch
    live       launch  <= today < firstRaids
    raids      firstRaids <= today

Sentinels (edit the template here, never the pages):
    <!--fphase:pill-->      hero badge pill on the Forever pages
    <!--fphase:fact-->      the launch fact on the homepage
    <!--fphase:build-->     "Beta build 1.60.1" style build line
    <!--fphase:prelaunch--> the strength-figure disclaimer pill
    <!--fphase:checked-->   "Last checked <date> against build <x>" on the guide

Usage:
    python3 scripts/forever_phase.py            # stamp
    python3 scripts/forever_phase.py --check    # exit 1 if stale
    python3 scripts/forever_phase.py --today 2026-11-05   # preview a date

Stdlib only. version_bar.py imports pill_short() from here so the strip's
Forever tab says the same thing as the pages.
"""

import datetime
import glob
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "scripts", "forever-data.js")


def meta():
    """Pull the dates and build out of forever-data.js without a JS engine."""
    with open(DATA, encoding="utf-8") as fh:
        src = fh.read()
    block = src[src.index("var META = {"): src.index("};", src.index("var META = {"))]
    out = {}
    for key in ("launch", "betaEnd", "firstRaids", "researched", "build", "launchHuman"):
        m = re.search(r"%s:\s*'([^']*)'" % key, block)
        out[key] = m.group(1) if m else ""
    return out


def phase_for(today, m):
    d = lambda s: datetime.date.fromisoformat(s)
    if today >= d(m["firstRaids"]):
        return "raids"
    if today >= d(m["launch"]):
        return "live"
    if today >= d(m["betaEnd"]):
        return "prelaunch"
    return "beta"


def human(iso):
    dt = datetime.date.fromisoformat(iso)
    return dt.strftime("%b %-d")


def strings(today, m):
    p = phase_for(today, m)
    launch = human(m["launch"])
    raids = human(m["firstRaids"])
    beta_end = human(m["betaEnd"])
    build = m["build"]
    checked = datetime.date.fromisoformat(m["researched"]).strftime("%B %-d, %Y")
    s = {
        "beta": {
            "pill": "Beta &middot; Launches %s" % launch,
            "pill_short": "Beta &middot; %s" % launch,
            "fact": "Launch, 3 pm Pacific. Beta runs to %s with a level 20 to 30 cap. First raids %s." % (beta_end, raids),
            "build": "Beta build %s" % build,
            "prelaunch": "Pre-launch assessment &middot; beta build %s &middot; no tier data used" % build,
            "checked": "Last checked %s against beta build %s. Anything Blizzard has not stated is marked as such. Racials and numbers can still change before launch." % (checked, build),
        },
        "prelaunch": {
            "pill": "Beta closed &middot; Launches %s" % launch,
            "pill_short": "Launches %s" % launch,
            "fact": "Launch, 3 pm Pacific. The beta closed %s. First raids %s." % (beta_end, raids),
            "build": "Final beta build %s" % build,
            "prelaunch": "Pre-launch assessment &middot; beta build %s &middot; no tier data used" % build,
            "checked": "Last checked %s against beta build %s. The beta has closed; launch builds can still change numbers." % (checked, build),
        },
        "live": {
            "pill": "Live &middot; Launched %s" % launch,
            "pill_short": "Live",
            "fact": "Launched %s at 3 pm Pacific. Level cap 60. First raids open %s." % (launch, raids),
            "build": "Build %s" % build,
            "prelaunch": "Kit-based assessment &middot; build %s &middot; no tier data yet" % build,
            "checked": "Last checked %s against build %s. Raids are not open yet, so there is no level-60 performance data; anything about relative strength is kit-based." % (checked, build),
        },
        "raids": {
            "pill": "Live &middot; Raids open",
            "pill_short": "Live",
            "fact": "Live since %s. Level cap 60. Raids open since %s." % (launch, raids),
            "build": "Build %s" % build,
            "prelaunch": "Kit-based assessment &middot; build %s &middot; tier data added as Wowhead publishes it" % build,
            "checked": "Last checked %s against build %s." % (checked, build),
        },
    }[p]
    s["phase"] = p
    return s


def pill_short(today=None):
    today = today or datetime.date.today()
    return strings(today, meta())["pill_short"]


def stamp_text(text, s):
    changed = []
    for key in ("pill", "fact", "build", "prelaunch", "checked"):
        open_tag, close_tag = "<!--fphase:%s-->" % key, "<!--/fphase:%s-->" % key
        if open_tag not in text:
            continue
        pattern = re.compile(re.escape(open_tag) + r".*?" + re.escape(close_tag), re.S)
        new = open_tag + s[key] + close_tag
        if pattern.search(text).group(0) != new:
            changed.append(key)
            text = pattern.sub(lambda _m: new, text, count=1)
    return text, changed


def main():
    args = sys.argv[1:]
    check_only = "--check" in args
    today = datetime.date.today()
    if "--today" in args:
        today = datetime.date.fromisoformat(args[args.index("--today") + 1])
    s = strings(today, meta())
    print("Phase for %s: %s (%s)" % (today, s["phase"], re.sub(r"&middot;", "·", s["pill"])))
    stale = 0
    for path in sorted(glob.glob(os.path.join(REPO, "*.html"))):
        with open(path, encoding="utf-8") as fh:
            before = fh.read()
        after, changed = stamp_text(before, s)
        if not changed:
            continue
        stale += 1
        print("  %s %s: %s" % ("STALE " if check_only else "stamped", os.path.basename(path), ", ".join(changed)))
        if not check_only:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(after)
    if check_only and stale:
        print("\n%d page(s) out of date. Run: python3 scripts/forever_phase.py" % stale)
        return 1
    print("\n%d page(s) %s." % (stale, "stale" if check_only else "updated"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
