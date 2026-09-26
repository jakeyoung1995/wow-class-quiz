#!/usr/bin/env python3
"""
version_bar.py — stamp the game-version switcher into every page.

The site covers three versions of WoW at once — WoW Forever, Midnight and
Classic — and before this, the only way to move between them was whichever
links a given page happened to carry. Wowhead solves the same problem with a
thin strip of tabs at the very top of every page, one per game version, with
the active one tinted. This does the same.

The strip is real HTML, stamped into each page, rather than injected by
JavaScript: crawlers see the cross-links between sections without running
anything, and it renders before any script loads.

Which tab is active is decided by filename prefix (see VERSION_OF). A page
that belongs to no single version — the Pro hub, the gear page — gets the
strip with nothing highlighted.

Usage:
    python3 scripts/version_bar.py            # stamp / re-stamp every page
    python3 scripts/version_bar.py --check    # exit 1 if any page is stale

Stdlib only, like the rest of scripts/.
"""

import glob
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Not pages: the Search Console stub, the 404, and redirect stubs that exist
# only to forward an old URL.
SKIP = {"google7243f81f2f7c028a.html", "404.html", "classic-plus.html"}

# filename -> version. Anything not listed is looked up by prefix below, and
# anything still unmatched is "neutral" (strip shown, no tab active).
VERSION_OF = {
    "index.html": "forever",
    "classic-hub.html": "classic",
    "midnight-hub.html": "midnight",
    "tier-list.html": "midnight",
    "team-comp-builder.html": "midnight",
    "selector.html": "midnight",
}
PREFIX_OF = (
    ("wow-forever-", "forever"),
    ("classic-", "classic"),
    ("wow-quiz-premium-hub", "neutral"),
    ("wow-quiz-", "midnight"),
)

TABS = [
    ("forever",  "/",                  "&#9854;&#65039;", "WoW Forever", "Beta &middot; Nov 4"),
    ("midnight", "/midnight-hub.html", "&#127756;", "Midnight",  ""),
    ("classic",  "/classic-hub.html",  "&#127942;", "Classic",   ""),
]

OPEN, CLOSE = "<!--gvb-->", "<!--/gvb-->"
CSS_LINK = '<link rel="stylesheet" href="/styles/version-bar.css">'


def version_for(name):
    if name in VERSION_OF:
        return VERSION_OF[name]
    for prefix, version in PREFIX_OF:
        if name.startswith(prefix):
            return version
    return "neutral"


def render(active):
    tabs = []
    for key, href, ico, label, sub in TABS:
        cls = "gvb-tab" + (" active" if key == active else "")
        pill = f'<span class="gvb-sub">{sub}</span>' if sub else ""
        tabs.append(
            f'<a class="{cls}" data-v="{key}" href="{href}">'
            f'<span class="gvb-ico" aria-hidden="true">{ico}</span>{label}{pill}</a>'
        )
    return (
        f'<nav class="gvb" data-active="{active}" aria-label="Game version">'
        '<div class="gvb-inner">'
        '<span class="gvb-label">Game version</span>'
        + "".join(tabs) +
        '<span class="gvb-spacer"></span>'
        '<a class="gvb-pro" href="/wow-quiz-premium-hub.html">&#10022; Pro</a>'
        "</div></nav>"
    )


def stamp(text, name):
    """Return (new_text, changed: bool)."""
    active = version_for(name)
    block = OPEN + render(active) + CLOSE
    before = text

    if OPEN in text:
        text = re.sub(re.escape(OPEN) + r".*?" + re.escape(CLOSE), lambda _m: block, text, count=1, flags=re.S)
    else:
        # First run: directly after the opening <body> tag.
        m = re.search(r"<body[^>]*>", text)
        if not m:
            return text, False
        text = text[:m.end()] + "\n" + block + text[m.end():]

    if CSS_LINK not in text:
        text = text.replace("</head>", "  " + CSS_LINK + "\n</head>", 1)

    return text, text != before


def main():
    check_only = "--check" in sys.argv
    stale = 0
    for path in sorted(glob.glob(os.path.join(REPO, "*.html"))):
        name = os.path.basename(path)
        if name in SKIP:
            continue
        with open(path, encoding="utf-8") as fh:
            before = fh.read()
        after, changed = stamp(before, name)
        if not changed:
            continue
        stale += 1
        print(f"  {'STALE ' if check_only else 'stamped'} {name} ({version_for(name)})")
        if not check_only:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(after)

    if check_only and stale:
        print(f"\n{stale} page(s) missing or out of date. Run: python3 scripts/version_bar.py")
        return 1
    print(f"\n{stale} page(s) {'stale' if check_only else 'updated'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
