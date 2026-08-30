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


def load_data():
    with open(DATA, encoding="utf-8") as fh:
        return json.load(fh)


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


# ── Tier list pre-rendering ───────────────────────────────────────────────
# tier-list.html shipped the rankings as "Loading tier data…" and injected the
# real content from JSON after load. Everything the page is actually about —
# every spec name, the patch, the updated date — existed only after JavaScript
# ran.
#
# That is the wrong trade for this page specifically. Its one advantage over
# Icy Veins is being current within minutes of a patch, and a crawler could not
# see that claim or the data behind it. Google does render JavaScript, but it
# does so on a delay and not always, and "Loading tier data…" is what gets
# indexed when it does not.
#
# So the same markup the browser builds is now written into the HTML at stamp
# time. The JavaScript still runs and still re-renders, so nothing about the
# live behaviour changes — the toggles and the fetch are untouched. This only
# means the page is complete before any of that happens.

TIER_DESCS = {
    "dps": {
        "S": "Best in slot — dominant in both raid and M+",
        "A": "Strong performers — competitive in any group",
        "B": "Solid — viable for all content, slightly behind meta",
        "C": "Can clear all content — may struggle for mythic raid spots",
    },
    "tank": {
        "S": "Top-tier survivability and utility",
        "A": "Strong raid and M+ presence",
        "B": "Capable — excellent in the right hands",
    },
    "heal": {
        "S": "Dominant throughput and utility",
        "A": "Strong in raid and M+ environments",
        "B": "Viable — unique utility in certain comps",
    },
}


def _pill(name, color=None):
    dot = ('<div class="spec-dot" style="background:%s"></div>' % color) if color else ""
    return '<div class="spec-pill">%s%s</div>' % (dot, name)


def _tier_blocks(groups, role):
    """Mirror of buildTierBlocks / buildSimpleTierBlocks in tier-list.html."""
    out = []
    for tier in ("S", "A", "B", "C"):
        items = groups.get(tier)
        if not items:
            continue
        desc = TIER_DESCS.get(role, {}).get(tier, "")
        out.append(
            '<div class="tier-block">'
            '<div class="tier-header">'
            '<div class="tier-label %s">%s</div>'
            '<div class="tier-desc">%s</div>'
            "</div>"
            '<div class="tier-specs">%s</div>'
            "</div>" % (tier.lower(), tier, desc, "".join(items))
        )
    return "".join(out)


def render_tier_html(data):
    """Return {container_id: html} for the three tier sections."""
    rendered = {}

    groups = {}
    for name, spec in data.get("dps_specs", {}).items():
        groups.setdefault(spec.get("tier"), []).append(_pill(name, spec.get("color")))
    rendered["dps-tiers"] = _tier_blocks(groups, "dps")

    # Tank and healer default to the M+ view, which is what the page shows
    # before anyone touches the dimension toggle.
    for section, container, role in (("tank", "tank-tiers", "tank"),
                                     ("healer", "heal-tiers", "heal")):
        groups = {}
        for name, spec in data.get(section, {}).items():
            groups.setdefault(spec.get("mplus"), []).append(_pill(name))
        rendered[container] = _tier_blocks(groups, role)

    return rendered


ROLE_LABEL = {"dps": "DPS", "tank": "Tank", "healer": "Healer"}
DIM_LABEL = {"mplus": "Mythic+", "raid": "Raid"}
TIER_RANK = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}


def _direction(old, new):
    """up / down / same, by tier rank rather than alphabet."""
    a, b = TIER_RANK.get(old, 9), TIER_RANK.get(new, 9)
    return "up" if b < a else ("down" if b > a else "same")


def render_recent_changes(data):
    """Build the "what moved this week" block from the scraper's own changelog.

    This is the one thing on the page a competitor cannot copy without also
    building the pipeline: an automatic record of what actually moved, dated,
    rather than a hand-written "updated for patch X" line.
    """
    log = data.get("changelog") or []
    if not log:
        return ""

    latest = log[-1]
    rows = []

    def add(entry, name_key):
        old_tier = entry.get("from")
        # "?" means the field had no previous value — the first time a rating
        # was recorded, not something that moved. Showing "? -> B" as a change
        # is both wrong and unreadable.
        if not old_tier or old_tier == "?":
            return
        # Changelog entries written before Aug 2026 have no dimension field.
        # Omit the label rather than defaulting it — guessing "Mythic+"
        # mislabelled an entire raid pass as M+.
        dim = entry.get("dimension")
        rows.append({
            "what": entry.get(name_key, ""),
            "role": ROLE_LABEL.get(entry.get("role"), entry.get("role", "")),
            "dim": DIM_LABEL.get(dim) if dim else None,
            "from": old_tier,
            "to": entry.get("to", "?"),
        })

    for change in latest.get("changes", []):
        add(change, "key")
    for change in latest.get("spec_changes", []):
        add(change, "spec")

    if not rows:
        return ('<h2 style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px;">'
                "No tier changes this week</h2>"
                '<p style="font-size:14px;color:var(--text2);margin:0;">'
                "Rankings were re-checked against current data on %s and nothing moved. "
                "This list is verified weekly whether or not it changes.</p>"
                % latest.get("date", ""))

    # Risers first — they are what people came to find out.
    rows.sort(key=lambda r: (0 if _direction(r["from"], r["to"]) == "up" else 1, r["what"]))

    items = []
    for r in rows[:12]:
        d = _direction(r["from"], r["to"])
        colour = {"up": "#58c878", "down": "#e07a6a"}.get(d, "var(--text2)")
        arrow = {"up": "&uarr;", "down": "&darr;"}.get(d, "&rarr;")
        items.append(
            '<li style="display:flex;align-items:center;gap:10px;padding:7px 0;'
            'border-bottom:1px solid var(--border);font-size:14px;">'
            '<span style="color:%s;font-weight:700;width:14px;">%s</span>'
            '<span style="color:var(--text);font-weight:600;flex:1;">%s</span>'
            '<span style="color:var(--text3);font-size:12px;">%s</span>'
            '<span style="color:var(--text2);font-family:ui-monospace,monospace;">'
            "%s &rarr; <b style=\"color:%s\">%s</b></span></li>"
            % (colour, arrow, r["what"],
               (r["role"] + " &middot; " + r["dim"]) if r["dim"] else r["role"],
               r["from"], colour, r["to"])
        )

    more = ""
    if len(rows) > 12:
        more = ('<p style="font-size:12px;color:var(--text3);margin:10px 0 0;">'
                "and %d more</p>" % (len(rows) - 12))

    risers = sum(1 for r in rows if _direction(r["from"], r["to"]) == "up")
    fallers = len(rows) - risers

    return (
        '<h2 style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">'
        "What moved in the last update</h2>"
        '<p style="font-size:13.5px;color:var(--text2);margin:0 0 14px;">'
        "%d change%s on %s &mdash; %d up, %d down. Rankings are re-checked weekly "
        "and within about twenty minutes of a new patch going live.</p>"
        '<ul style="list-style:none;margin:0;padding:0;">%s</ul>%s'
        % (len(rows), "" if len(rows) == 1 else "s", latest.get("date", ""),
           risers, fallers, "".join(items), more)
    )


def stamp_tier_list(text, facts, data):
    """Fill the three tier containers, the eyebrow and the freshness note.

    Content is wrapped in sentinel comments. Without them the second run would
    have to match a div containing nested divs, and a lazy regex would stop at
    the first closing tag and corrupt the page.
    """
    changes = []

    for container, html in render_tier_html(data).items():
        open_tag = "<!--tiers:%s-->" % container
        close_tag = "<!--/tiers:%s-->" % container
        wrapped = open_tag + html + close_tag

        if open_tag in text:
            # Already stamped: replace only what sits between the sentinels.
            pattern = re.compile(re.escape(open_tag) + r".*?" + re.escape(close_tag), re.S)
            if pattern.search(text).group(0) != wrapped:
                changes.append("re-rendered " + container)
            text = pattern.sub(lambda _m: wrapped, text, count=1)
        else:
            # First run: the container still holds the loading placeholder.
            pattern = re.compile(
                r'(<div id="%s"[^>]*>)(.*?)(</div>)' % re.escape(container), re.S
            )
            match = pattern.search(text)
            if not match:
                continue
            changes.append("pre-rendered " + container)
            text = text[:match.start()] + match.group(1) + wrapped + match.group(3) + text[match.end():]

    # The patch and updated date are the freshness claim. They belong in the
    # HTML rather than in a string the browser assembles after load.
    eyebrow = "WoW Midnight · %s · Patch %s" % (facts["season_token"], facts["patch"])
    updated = data.get("_meta", {}).get("last_updated", "")
    note = ('<div class="freshness-dot"></div>Updated %s · Patch %s · '
            "Data: Warcraftlogs &amp; M+ rankings" % (updated, facts["patch"]))

    # Recent changes block — same sentinel approach, since the content it
    # replaces contains nested list markup.
    changes_html = render_recent_changes(data)
    if changes_html:
        wrapped = "<!--changes-->" + changes_html + "<!--/changes-->"
        pattern = re.compile(r"<!--changes-->.*?<!--/changes-->", re.S)
        found = pattern.search(text)
        if found:
            if found.group(0) != wrapped:
                changes.append("recent changes")
            text = pattern.sub(lambda _m: wrapped, text, count=1)

    # dateModified in the Article schema. Google reads this as the freshness
    # claim, so it has to track the data rather than the day the file was
    # written.
    # Matched on the JSON key, not sentinels: this sits inside a JSON-LD
    # block, where an HTML comment is literal text rather than a comment and
    # would make dateModified an invalid date.
    modified = data.get("_meta", {}).get("last_updated", "")
    if modified:
        pattern = re.compile(r'("dateModified":\s*")([\d-]+)(")')
        found = pattern.search(text)
        if found:
            if found.group(2) != modified:
                changes.append("schema dateModified")
            text = pattern.sub(
                lambda m: m.group(1) + modified + m.group(3), text, count=1
            )

    # The eyebrow holds no nested tags, so a lazy match is safe there.
    compiled = re.compile(r'(<p class="hero-eyebrow" id="heroEyebrow">)(.*?)(</p>)', re.S)
    match = compiled.search(text)
    if match and match.group(2).strip() != eyebrow.strip():
        changes.append("hero eyebrow")
        text = compiled.sub(lambda m: m.group(1) + eyebrow + m.group(3), text, count=1)

    # The freshness note DOES contain a nested div, so the same lazy match would
    # stop at the inner closing tag, duplicate the content and leave a stray
    # </div>. Sentinels again, for the same reason as the tier blocks.
    open_tag, close_tag = "<!--freshness-->", "<!--/freshness-->"
    wrapped = open_tag + note + close_tag
    if open_tag in text:
        pattern = re.compile(re.escape(open_tag) + r".*?" + re.escape(close_tag), re.S)
        if pattern.search(text).group(0) != wrapped:
            changes.append("freshness note")
        text = pattern.sub(lambda _m: wrapped, text, count=1)
    else:
        pattern = re.compile(
            r'(<div class="freshness-note" id="freshnessNote">)(.*?)(</div>\s*</section>)', re.S
        )
        match = pattern.search(text)
        if match:
            changes.append("freshness note")
            text = pattern.sub(lambda m: m.group(1) + wrapped + m.group(3), text, count=1)

    return text, changes


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
        if name == "tier-list.html":
            after, extra = stamp_tier_list(after, facts, load_data())
            changes += extra
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
