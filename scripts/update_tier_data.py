#!/usr/bin/env python3
"""
update_tier_data.py
===================
Weekly automated tier list updater for WoW Class Quiz.

Run by GitHub Actions every Monday. Fetches current tier data from Icy Veins,
compares to wow-patch-data.json, and:
  - For tier-only changes: updates the JSON and commits to main (auto-deploys via GitHub Pages)
  - For structural changes (new specs, removed specs, new classes): opens a GitHub Issue
    for manual review instead of auto-merging.
  - Sends an admin email to NOTIFY_EMAIL summarising what was done.
  - For tier changes, ALSO fetches the email subscriber list from the Apps Script endpoint
    and sends each subscriber a "tier shift" notification.

Environment variables (set as GitHub Secrets):
  NOTIFY_EMAIL           — admin address; also the SMTP login and From address.
                           If unset, all email is skipped (tier updates still run).
  GMAIL_APP_PASSWORD     — 16-char Google App Password for NOTIFY_EMAIL
  GITHUB_TOKEN           — automatically provided by GitHub Actions
  GITHUB_REPOSITORY      — automatically provided by GitHub Actions (owner/repo)
  DRY_RUN                — "true" to parse and report without writing, emailing,
                           or opening issues
  SUBSCRIBER_FETCH_URL   — (optional) Google Apps Script endpoint that returns JSON list of subscriber emails
  SUBSCRIBER_FETCH_KEY   — (optional) shared secret appended as ?key=… to SUBSCRIBER_FETCH_URL
"""

import json
import os
import re
import smtplib
import sys
import urllib.request
import urllib.error
from datetime import date, datetime, timezone
from email.mime.text import MIMEText

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "wow-patch-data.json")
# Admin address. Kept out of source because this repo is public — set the
# NOTIFY_EMAIL GitHub secret. Without it the tier update still runs and commits;
# only the notification emails are skipped.
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "")
FROM_EMAIL = os.environ.get("NOTIFY_EMAIL", "")

# When true, parse and report but change nothing: no file write, no email,
# no GitHub issue. Set by the workflow_dispatch "dry_run" input.
DRY_RUN = os.environ.get("DRY_RUN", "false").strip().lower() in ("1", "true", "yes")

# Icy Veins hub page — used to dynamically discover current tier list URLs.
# If the hub scrape fails, these fallback URLs are used instead.
ICYVEINS_HUB = "https://www.icy-veins.com/wow/tier-lists"
ICYVEINS_FALLBACK_URLS = {
    "dps":    "https://www.icy-veins.com/wow/mythic-dps-tier-list",
    "tank":   "https://www.icy-veins.com/wow/mythic-tank-tier-list",
    "healer": "https://www.icy-veins.com/wow/mythic-healer-tier-list",
}

# Blizzard's CDN version endpoint. This is the authoritative answer to "what
# build is live right now" — it flips the moment Blizzard pushes a patch, with
# no news article, scrape or human in the loop. Product codes:
#   wow             retail live      wowt              retail PTR
#   wow_classic     classic live     wow_classic_ptr   classic PTR
BLIZZ_VERSIONS_URL = "http://us.patch.battle.net:1119/{product}/versions"


def fetch_live_patch(product: str = "wow") -> dict:
    """
    Return {'patch': '12.1', 'build': '69404', 'version': '12.1.0.69404'} for a
    Blizzard product, or {} if the endpoint is unreachable or malformed.

    The response is a pipe-delimited table; we want the `us` row's VersionsName
    (e.g. "12.1.0.69404"). The marketing patch number is the first two
    components — 12.1.0 ships as "Patch 12.1", and 12.0.5 as "Patch 12.0.5",
    so a trailing ".0" is dropped but a non-zero third component is kept.
    """
    url = BLIZZ_VERSIONS_URL.format(product=product)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "wowclassquiz-patch-bot"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"  Could not reach Blizzard versions endpoint for '{product}': {exc}")
        return {}

    for line in body.splitlines():
        if not line.startswith("us|"):
            continue
        fields = line.split("|")
        if len(fields) < 6:
            continue
        version = fields[5].strip()          # e.g. 12.1.0.69404
        parts = version.split(".")
        if len(parts) < 3:
            continue
        major, minor, third = parts[0], parts[1], parts[2]
        patch = f"{major}.{minor}" if third == "0" else f"{major}.{minor}.{third}"
        return {"patch": patch, "build": fields[4].strip(), "version": version}

    print(f"  Blizzard versions response for '{product}' had no parseable us row")
    return {}


# Keywords used to identify the right link on the hub page for each role
ICYVEINS_HUB_KEYWORDS = {
    "dps":    ["mythic", "dps", "ranking"],
    "tank":   ["mythic", "tank", "ranking"],
    "healer": ["mythic", "healer", "ranking"],
}


def discover_icyveins_urls() -> dict:
    """
    Scrape the Icy Veins tier-lists hub page to find the current M+ tier list URLs
    for DPS, Tank, and Healer. Falls back to ICYVEINS_FALLBACK_URLS if scraping fails
    or a URL can't be found.

    This makes the script resilient to Icy Veins renaming their URL slugs between
    expansions (e.g. /dps-tier-list → /mythic-dps-tier-list).
    """
    discovered = {}
    try:
        html = fetch_tier_page(ICYVEINS_HUB)
        # Find all href="/wow/..." links on the hub page
        links = re.findall(r'href="(https?://www\.icy-veins\.com/wow/[^"]+)"[^>]*>([^<]+)<', html)
        # Also catch relative links
        rel_links = re.findall(r'href="(/wow/[^"]+)"[^>]*>([^<]+)<', html)
        all_links = links + [("https://www.icy-veins.com" + p, t) for p, t in rel_links]

        for role, keywords in ICYVEINS_HUB_KEYWORDS.items():
            best_url = None
            best_score = 0
            for url, text in all_links:
                combined = (url + " " + text).lower()
                score = sum(1 for kw in keywords if kw in combined)
                # Prefer URLs that contain all keywords and are actual tier list pages
                if score > best_score and ("tier-list" in url or "ranking" in url):
                    best_score = score
                    best_url = url
            if best_url and best_score >= 2:
                discovered[role] = best_url
                print(f"  Discovered {role} URL: {best_url}")
            else:
                discovered[role] = ICYVEINS_FALLBACK_URLS[role]
                print(f"  Could not discover {role} URL from hub — using fallback: {ICYVEINS_FALLBACK_URLS[role]}")
    except Exception as e:
        print(f"  WARNING: Hub page scrape failed ({e}) — using all fallback URLs")
        return dict(ICYVEINS_FALLBACK_URLS)

    # Fill any missing roles with fallbacks
    for role, url in ICYVEINS_FALLBACK_URLS.items():
        if role not in discovered:
            discovered[role] = url

    return discovered

# Map Icy Veins display names → our JSON keys
# Update this dict if Icy Veins changes their display names.
DISPLAY_TO_KEY = {
    # DPS
    "Assassination Rogue": "Rogue", "Outlaw Rogue": "Rogue", "Subtlety Rogue": "Rogue",
    "Arcane Mage": "Mage", "Fire Mage": "Mage", "Frost Mage": "Mage",
    "Affliction Warlock": "Warlock", "Demonology Warlock": "Warlock", "Destruction Warlock": "Warlock",
    "Frost Death Knight": "Death Knight", "Unholy Death Knight": "Death Knight",
    "Beast Mastery Hunter": "Hunter", "Marksmanship Hunter": "Hunter", "Survival Hunter": "Hunter",
    "Havoc Demon Hunter": "Demon Hunter", "Devourer Demon Hunter": "Demon Hunter",
    "Elemental Shaman": "Shaman", "Enhancement Shaman": "Shaman",
    "Balance Druid": "Druid", "Feral Druid": "Druid",
    "Windwalker Monk": "Monk",
    "Arms Warrior": "Warrior", "Fury Warrior": "Warrior",
    "Retribution Paladin": "Paladin",
    "Devastation Evoker": "Evoker", "Augmentation Evoker": "Evoker",
    "Shadow Priest": "Priest",
    # Tank
    "Blood Death Knight": "Blood Death Knight",
    "Vengeance Demon Hunter": "Vengeance Demon Hunter",
    "Guardian Druid": "Guardian Druid",
    "Brewmaster Monk": "Brewmaster Monk",
    "Protection Paladin": "Protection Paladin",
    "Protection Warrior": "Protection Warrior",
    # Healer
    "Restoration Druid": "Restoration Druid",
    "Preservation Evoker": "Preservation Evoker",
    "Mistweaver Monk": "Mistweaver Monk",
    "Holy Paladin": "Holy Paladin",
    "Holy Priest": "Holy Priest",
    "Discipline Priest": "Discipline Priest",
    "Restoration Shaman": "Restoration Shaman",
}

# ---------------------------------------------------------------------------
# HTML parser: scrape tier rank from Icy Veins tier list pages
# ---------------------------------------------------------------------------
TIER_TABLE_RE = re.compile(r'<table[^>]*class="[^"]*\btier-list\b[^"]*"[^>]*>(.*?)</table>', re.S | re.I)
TR_RE = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S | re.I)
TD_RE = re.compile(r'<td[^>]*>(.*?)</td>', re.S | re.I)
ENTRY_RE = re.compile(r'<span[^>]*class="[^"]*\btier-list-entry\b[^"]*"[^>]*>(.*?)(?=<span[^>]*class="[^"]*\btier-list-entry\b|$)', re.S | re.I)
IMG_ALT_RE = re.compile(r'<img[^>]*\balt="([^"]+)"', re.I)
TAG_RE = re.compile(r'<[^>]+>')

# Icy Veins grades on a finer scale (S+, S, A+, A, B+, B, C, D) than our JSON,
# which only stores S/A/B/C. Collapse the "+" variants onto the base letter.
TIER_NORMALISE = {
    "S+": "S", "S": "S",
    "A+": "A", "A": "A",
    "B+": "B", "B": "B",
    "C+": "C", "C": "C", "D": "C", "F": "C",
}


def parse_tier_table(html: str) -> dict:
    """
    Parse an Icy Veins tier list page into {spec display name: tier letter}.

    Current structure (verified against the live pages):

        <table class="tier-list">
          <tr>
            <td>S+</td>                                  <- tier label
            <td><span class="tier-list-entry" ...>
                  <img alt="Arms Warrior" ...>           <- spec name
                  ...
            </td>
            ...

    The spec name is read from the entry image's alt text, which is a clean
    "Spec Class" string. The surrounding <details> body is long-form prose and
    is deliberately ignored.
    """
    results = {}
    table_match = TIER_TABLE_RE.search(html)
    if not table_match:
        return results

    for row in TR_RE.findall(table_match.group(1)):
        cells = TD_RE.findall(row)
        if len(cells) < 2:
            continue  # header row, or a row with no entries

        tier_raw = TAG_RE.sub("", cells[0]).strip().upper()
        tier = TIER_NORMALISE.get(tier_raw)
        if not tier:
            continue

        for cell in cells[1:]:
            for entry in ENTRY_RE.findall(cell):
                alt = IMG_ALT_RE.search(entry)
                if alt:
                    results[alt.group(1).strip()] = tier

    return results


def fetch_tier_page(url: str) -> str:
    """Fetch a page with a browser-like User-Agent."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_tier_list(html: str) -> tuple:
    """
    Parse an Icy Veins tier list page and return:
      ( { our_json_key: best_tier_letter },      # class-level aggregate
        { spec_display_name: tier_letter } )     # raw spec-level

    For classes with multiple specs the aggregate takes the best (highest)
    tier across specs. The spec-level dict is returned unaggregated because
    tier-list.html renders DPS from the spec-level "dps_specs" structure, not
    from the class-level one.
    """
    raw = parse_tier_table(html)

    # If the table parser found nothing (page structure changed again), try the
    # looser regex fallback before giving up.
    if not raw:
        raw = regex_fallback_parse(html)

    tier_order = {"S": 0, "A": 1, "B": 2, "C": 3, "?": 9}
    aggregated = {}

    for spec_display, tier in raw.items():
        # Normalise capitalisation
        spec_display_norm = spec_display.strip().title()
        key = DISPLAY_TO_KEY.get(spec_display_norm) or DISPLAY_TO_KEY.get(spec_display.strip())
        if not key:
            continue
        if key not in aggregated:
            aggregated[key] = tier
        else:
            # Keep the best tier for this class
            if tier_order.get(tier, 9) < tier_order.get(aggregated[key], 9):
                aggregated[key] = tier

    return aggregated, raw


def regex_fallback_parse(html: str) -> dict:
    """
    Fallback: scan raw HTML for patterns like  data-tier="S" ... spec name.
    Very approximate — better than nothing if the HTML parser finds nothing.
    """
    results = {}
    # Look for anchor tags that have class and tier context nearby
    # Pattern: some block with S/A/B/C tier label followed by spec names
    blocks = re.findall(
        r'(?:tier[_\-\s]?["\']?\s*([SsAaBbCc])["\']?)[^<]{0,200}?'
        r'<[^>]+>([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})</[^>]+>',
        html
    )
    for tier_letter, spec_name in blocks:
        results[spec_name.strip()] = tier_letter.upper()
    return results


# Which JSON structure each role's page actually renders from. tier-list.html
# reads dps_specs for DPS but the flat tank/healer maps for the other two, so
# DPS needs a second write that the others do not.
SPEC_LEVEL_SECTIONS = {"dps": "dps_specs"}


# The *_specs_detailed sections carry a second copy of every tier letter,
# alongside ratings the premium quizzes render. Nothing was ever writing them,
# so they drifted from the sections the scraper does maintain — 20 of 26 DPS
# entries disagreed. Reconciled on every run so the file self-heals rather than
# needing a one-off repair.
#
# M+ is scraped and therefore authoritative. Raid is hand-curated and flows the
# other way, so it is copied down for tank/healer (where the curated value lives
# in the flat section) and left untouched for DPS (where the detailed section is
# itself the curated home).
DETAILED_SECTIONS = {
    "dps_specs_detailed":    ("dps_specs", "tier", None),
    "tank_specs_detailed":   ("tank", "mplus", "raid"),
    "healer_specs_detailed": ("healer", "mplus", "raid"),
}


def reconcile_detailed(data: dict) -> list:
    """Bring *_specs_detailed back in line with the sections the scraper owns.
    Returns [(section, spec, field, old, new), ...]."""
    fixed = []
    for detailed_key, (source_key, mplus_field, raid_field) in DETAILED_SECTIONS.items():
        detailed = data.get(detailed_key)
        source = data.get(source_key)
        if not isinstance(detailed, dict) or not isinstance(source, dict):
            continue
        for spec, src in source.items():
            entry = detailed.get(spec)
            if not isinstance(entry, dict) or not isinstance(src, dict):
                continue
            live_mplus = src.get(mplus_field)
            if live_mplus and entry.get("mplus") != live_mplus:
                fixed.append((detailed_key, spec, "mplus", entry.get("mplus"), live_mplus))
                entry["mplus"] = live_mplus
            if raid_field:
                live_raid = src.get(raid_field)
                if live_raid and entry.get("raid") != live_raid:
                    fixed.append((detailed_key, spec, "raid", entry.get("raid"), live_raid))
                    entry["raid"] = live_raid
    return fixed


def sync_spec_tiers(data: dict, role: str, spec_tiers: dict) -> tuple:
    """
    Apply spec-level tiers to the section the site renders from.

    Returns (changes, unknown_specs) where changes is
    [(spec_name, old_tier, new_tier), ...] and unknown_specs are specs Icy
    Veins lists that we have no entry for — reported as structural rather than
    silently dropped, because a missing spec is a hole in the published list.
    """
    section = SPEC_LEVEL_SECTIONS.get(role)
    if not section or section not in data:
        return [], []

    entries = data[section]
    changes, unknown = [], []

    for spec_display, tier in spec_tiers.items():
        name = spec_display.strip()
        if name not in entries:
            # Only report specs we can attribute to a class we track, so an
            # unrelated page change does not spam issues.
            if DISPLAY_TO_KEY.get(name.title()) or DISPLAY_TO_KEY.get(name):
                unknown.append(name)
            continue
        old_tier = entries[name].get("tier", "?")
        if old_tier != tier:
            entries[name]["tier"] = tier
            changes.append((name, old_tier, tier))

    return changes, unknown


# ---------------------------------------------------------------------------
# Detect structural vs tier-only changes
# ---------------------------------------------------------------------------
def classify_changes(old_data: dict, new_tiers: dict, role: str) -> dict:
    """
    Returns:
      {
        'tier_changes': [(key, old_tier, new_tier), ...],
        'structural': [(key, reason), ...]   # specs on Icy Veins but not in our JSON
      }
    """
    tier_changes = []
    structural = []
    role_data = old_data.get(role, {})

    for key, new_tier in new_tiers.items():
        if key not in role_data:
            # New spec/class not in our data
            reason = f"New spec '{key}' appeared on Icy Veins tier list"
            structural.append((key, reason))
        else:
            old_tier = role_data[key].get("mplus", "?")  # we use mplus as canonical
            if old_tier != new_tier:
                tier_changes.append((key, old_tier, new_tier))

    return {"tier_changes": tier_changes, "structural": structural}


# ---------------------------------------------------------------------------
# GitHub Issue creation
# ---------------------------------------------------------------------------
def create_github_issue(title: str, body: str):
    """Create a GitHub Issue via the REST API."""
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "jakeyoung1995/wow-class-quiz")
    if DRY_RUN:
        print(f"  [dry-run] would open GitHub issue: {title}")
        return
    if not token:
        print("WARNING: GITHUB_TOKEN not set — cannot create issue")
        return

    url = f"https://api.github.com/repos/{repo}/issues"
    payload = json.dumps({"title": title, "body": body}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            print(f"GitHub Issue created: {result.get('html_url')}")
    except Exception as e:
        print(f"Failed to create GitHub Issue: {e}")


# ---------------------------------------------------------------------------
# Email notification
# ---------------------------------------------------------------------------
def send_email(subject: str, body: str, to_email: str = None, html_body: str = None):
    """
    Send an email via Gmail SMTP.
      - to_email: recipient (defaults to admin NOTIFY_EMAIL).
      - html_body: optional HTML alternative for prettier subscriber emails.
    """
    password = os.environ.get("GMAIL_APP_PASSWORD", "")
    if not password:
        print("WARNING: GMAIL_APP_PASSWORD not set — skipping email")
        return False
    if not FROM_EMAIL:
        print("WARNING: NOTIFY_EMAIL not set — skipping email")
        return False

    to_email = to_email or NOTIFY_EMAIL
    if not to_email:
        print("WARNING: no recipient — skipping email")
        return False

    if DRY_RUN:
        print(f"  [dry-run] would email {to_email}: {subject}")
        return True

    if html_body:
        from email.mime.multipart import MIMEMultipart
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(body, "plain"))
        msg.attach(MIMEText(html_body, "html"))
    else:
        msg = MIMEText(body, "plain")

    msg["Subject"] = subject
    msg["From"] = f"WoW Class Quiz <{FROM_EMAIL}>"
    msg["To"] = to_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(FROM_EMAIL, password)
            server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
        return True
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        return False


def fetch_subscribers() -> list:
    """
    Fetch the email subscriber list from the Apps Script endpoint.
    Expects the endpoint to return a JSON array of email strings (or {emails: [...]}) .
    Returns [] if not configured or on error.
    """
    fetch_url = os.environ.get("SUBSCRIBER_FETCH_URL", "")
    fetch_key = os.environ.get("SUBSCRIBER_FETCH_KEY", "")
    if not fetch_url:
        print("  (no SUBSCRIBER_FETCH_URL set — skipping subscriber emails)")
        return []
    url = fetch_url
    if fetch_key:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}key={fetch_key}"
    try:
        req_obj = urllib.request.Request(url, headers={"User-Agent": "wowclassquiz-tier-bot"})
        with urllib.request.urlopen(req_obj, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        if isinstance(data, list):
            emails = data
        elif isinstance(data, dict):
            emails = data.get("emails") or data.get("subscribers") or []
        else:
            emails = []
        # Dedupe + light validation
        cleaned = sorted({e.strip().lower() for e in emails if isinstance(e, str) and "@" in e})
        print(f"  Fetched {len(cleaned)} subscribers")
        return cleaned
    except Exception as e:
        print(f"  Failed to fetch subscribers: {e}")
        return []


def build_tier_shift_email(all_tier_changes, patch):
    """Build a friendly subscriber email about tier changes this week."""
    if not all_tier_changes:
        return None, None, None

    role_labels = {"dps": "DPS", "tank": "Tank", "healer": "Healer"}
    arrow_color = {
        # going up = green, going down = grey
        ("S", "A"): "#b0a080", ("S", "B"): "#b0a080", ("S", "C"): "#b0a080",
        ("A", "B"): "#b0a080", ("A", "C"): "#b0a080",
        ("B", "C"): "#b0a080",
        ("A", "S"): "#58c878", ("B", "S"): "#58c878", ("C", "S"): "#58c878",
        ("B", "A"): "#58c878", ("C", "A"): "#58c878",
        ("C", "B"): "#58c878",
    }

    subject = f"Tier shift this week — {len(all_tier_changes)} change(s) in patch {patch}"

    plain_lines = [
        f"Hey — tier rankings just shifted for patch {patch}.",
        "",
        "What changed this week:",
    ]
    html_rows = []
    for role, key, old_t, new_t in all_tier_changes:
        plain_lines.append(f"  • [{role_labels.get(role, role)}] {key}: {old_t} → {new_t}")
        color = arrow_color.get((old_t, new_t), "#d4aa52")
        html_rows.append(
            f'<tr><td style="padding:6px 14px;color:#b0a080;font-size:13px;">{role_labels.get(role, role)}</td>'
            f'<td style="padding:6px 14px;color:#f0e8d8;font-weight:600;">{key}</td>'
            f'<td style="padding:6px 14px;color:#b0a080;">{old_t} <span style="color:{color}">→</span> '
            f'<span style="color:{color};font-weight:700">{new_t}</span></td></tr>'
        )
    plain_lines += [
        "",
        "See the full updated tier list: https://wowclassquiz.com/tier-list.html",
        "Re-take the quiz with the new data: https://wowclassquiz.com/",
        "",
        "— Jake (WoW Class Quiz)",
        "",
        "You're getting this because you signed up for tier shift alerts at wowclassquiz.com.",
        "Reply 'unsubscribe' and I'll take you off the list.",
    ]
    plain = "\n".join(plain_lines)

    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0a0800;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#f0e8d8;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:13px;letter-spacing:2px;color:#d4aa52;text-transform:uppercase;">WoW Class Quiz</div>
      <h1 style="font-size:24px;margin:8px 0 4px 0;color:#f0cc70;">Tier shift this week</h1>
      <div style="color:#b0a080;font-size:14px;">Patch {patch}</div>
    </div>
    <div style="background:#110f08;border:1px solid #2e2a1e;border-radius:12px;padding:8px 0;">
      <table style="width:100%;border-collapse:collapse;">{''.join(html_rows)}</table>
    </div>
    <div style="text-align:center;margin-top:28px;">
      <a href="https://wowclassquiz.com/tier-list.html" style="display:inline-block;background:#d4aa52;color:#0a0800;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View full tier list →</a>
    </div>
    <div style="text-align:center;margin-top:32px;color:#6a5a40;font-size:12px;">
      You're getting this because you signed up for tier alerts at <a href="https://wowclassquiz.com" style="color:#b0a080;">wowclassquiz.com</a>.<br>
      Reply <em>unsubscribe</em> and I'll remove you.
    </div>
  </div>
</body></html>"""
    return subject, plain, html


def notify_subscribers(all_tier_changes, patch):
    """Send the tier-shift email to every subscriber."""
    if not all_tier_changes:
        print("  No tier changes — not emailing subscribers.")
        return
    subscribers = fetch_subscribers()
    if not subscribers:
        return
    subject, plain, html = build_tier_shift_email(all_tier_changes, patch)
    sent = 0
    for email in subscribers:
        if send_email(subject, plain, to_email=email, html_body=html):
            sent += 1
    print(f"  Tier-shift email: {sent}/{len(subscribers)} delivered.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    # Load current data file
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    today = date.today().isoformat()
    patch = data["_meta"].get("patch", "unknown")

    # Reconcile the recorded patch against what is actually live. Previously
    # _meta.patch was seeded by hand and never touched again, so the site sat on
    # "12.0.5" for months after 12.1 shipped.
    patch_change = None
    live = fetch_live_patch("wow")
    if live and live["patch"] != patch:
        patch_change = (patch, live["patch"])
        print(f"\nPATCH CHANGE DETECTED: {patch} -> {live['patch']} (build {live['build']})")
        data["_meta"]["patch"] = live["patch"]
        data["_meta"]["build"] = live["build"]
        patch = live["patch"]
        # The season almost always rolls with a major patch, but Blizzard does
        # not publish it anywhere machine-readable. Flag it rather than guess.
        data["_meta"]["season_needs_review"] = True
    elif live:
        data["_meta"]["build"] = live["build"]
        print(f"\nLive patch confirmed: {live['patch']} (build {live['build']})")

    all_tier_changes = []
    all_spec_changes = []
    all_structural = []
    fetch_errors = []

    print(f"WoW Class Quiz — Tier Update Run ({today}, patch {patch})")
    if DRY_RUN:
        print("DRY RUN — no file writes, no email, no issues.")
    print("=" * 60)

    print("\nDiscovering current Icy Veins tier list URLs...")
    icyveins_urls = discover_icyveins_urls()

    for role, url in icyveins_urls.items():
        print(f"\nFetching {role} tier list from {url} ...")
        try:
            html = fetch_tier_page(url)
        except Exception as e:
            msg = f"Failed to fetch {role} tier list: {e}"
            print(f"  ERROR: {msg}")
            fetch_errors.append(msg)
            continue

        new_tiers, spec_tiers = parse_tier_list(html)
        print(f"  Parsed {len(new_tiers)} class entries, {len(spec_tiers)} spec entries")

        if not new_tiers:
            msg = f"No tier data parsed for {role} — Icy Veins page structure may have changed"
            print(f"  WARNING: {msg}")
            fetch_errors.append(msg)
            continue

        changes = classify_changes(data, new_tiers, role)
        all_tier_changes.extend([(role, *c) for c in changes["tier_changes"]])
        all_structural.extend([(role, *c) for c in changes["structural"]])

        # Apply tier changes to data.
        #
        # Only "mplus" is touched. The source pages are Icy Veins' *Mythic+*
        # tier lists, so they say nothing about raid performance — copying the
        # M+ letter into "raid" silently overwrote hand-curated raid tiers and
        # collapsed the M+/Raid toggle on tier-list.html into two identical
        # views. Raid tiers stay manual until there is a raid source to scrape.
        for key, old_tier, new_tier in changes["tier_changes"]:
            data[role][key]["mplus"] = new_tier
            print(f"  Updated {key}: mplus {old_tier} → {new_tier} (raid left as-is)")

        # Spec-level pass. tier-list.html renders DPS from "dps_specs", so
        # without this the class-level write above never reaches the page.
        spec_changes, unknown_specs = sync_spec_tiers(data, role, spec_tiers)
        for name, old_tier, new_tier in spec_changes:
            print(f"  Updated spec {name}: {old_tier} → {new_tier}")
        all_spec_changes.extend([(role, *c) for c in spec_changes])
        for name in unknown_specs:
            all_structural.append(
                (role, name, f"Spec '{name}' is on the Icy Veins {role} list but "
                             f"has no entry in {SPEC_LEVEL_SECTIONS.get(role)}")
            )

    # Bring the detailed sections back in line with what was just scraped.
    detailed_fixes = reconcile_detailed(data)
    if detailed_fixes:
        print(f"\nReconciled {len(detailed_fixes)} detailed tier field(s):")
        for section, spec, field, was, now in detailed_fixes[:10]:
            print(f"  {section}.{spec}.{field}: {was} -> {now}")
        if len(detailed_fixes) > 10:
            print(f"  ... and {len(detailed_fixes) - 10} more")

    # Update metadata
    data["_meta"]["last_updated"] = today
    if all_tier_changes or not fetch_errors:
        data["_meta"]["needs_refresh"] = False  # we have fresh data

    # Log changes
    if all_tier_changes or all_spec_changes:
        data["changelog"].append({
            "date": today,
            "patch": patch,
            "changes": [
                {"role": r, "key": k, "from": o, "to": n}
                for r, k, o, n in all_tier_changes
            ],
            "spec_changes": [
                {"role": r, "spec": k, "from": o, "to": n}
                for r, k, o, n in all_spec_changes
            ]
        })
        # Keep only last 20 changelog entries
        data["changelog"] = data["changelog"][-20:]

    # Write updated JSON
    if DRY_RUN:
        print(f"\n[dry-run] would write {DATA_FILE} "
              f"({len(all_tier_changes)} class + {len(all_spec_changes)} spec "
              f"change(s)) — file left untouched")
    else:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\nWrote updated {DATA_FILE}")

    # -----------------------------------------------------------------------
    # Build email + issue content
    # -----------------------------------------------------------------------
    if (not patch_change and not all_tier_changes and not all_spec_changes
            and not detailed_fixes and not all_structural and not fetch_errors):
        subject = f"[WoW Class Quiz] No tier changes this week (patch {patch})"
        body = (
            f"Weekly tier check ran on {today}.\n\n"
            f"No tier changes detected for patch {patch} / {data['_meta'].get('season', '')}.\n"
            f"No action taken.\n"
        )
    else:
        lines = [f"Weekly tier update report — {today} — patch {patch}\n"]

        if patch_change:
            lines.append(f"*** NEW PATCH LIVE: {patch_change[0]} -> {patch_change[1]} ***")
            lines.append("  _meta.patch has been updated automatically.")
            lines.append("  _meta.season still says "
                         f"'{data['_meta'].get('season', '?')}' — review that manually.")
            lines.append("")

        if all_tier_changes:
            lines.append("TIER CHANGES (auto-committed to main):")
            for role, key, old_t, new_t in all_tier_changes:
                lines.append(f"  [{role.upper()}] {key}: {old_t} → {new_t}")
            lines.append("")

        if all_spec_changes:
            lines.append("SPEC-LEVEL CHANGES (what tier-list.html renders for DPS):")
            for role, name, old_t, new_t in all_spec_changes:
                lines.append(f"  [{role.upper()}] {name}: {old_t} → {new_t}")
            lines.append("")

        if all_structural:
            lines.append("STRUCTURAL CHANGES (GitHub Issue opened — needs your review):")
            for role, key, reason in all_structural:
                lines.append(f"  [{role.upper()}] {reason}")
            lines.append("")

        if fetch_errors:
            lines.append("FETCH ERRORS (manual check recommended):")
            for e in fetch_errors:
                lines.append(f"  {e}")
            lines.append("")

        lines.append("Site: https://wowclassquiz.com")
        lines.append("Repo: https://github.com/jakeyoung1995/wow-class-quiz")

        subject = (f"[WoW Class Quiz] {'PATCH ' + patch_change[1] + ' LIVE — ' if patch_change else ''}"
                   f"Tier update — {len(all_tier_changes)} class, "
                   f"{len(all_spec_changes)} spec, {len(all_structural)} structural")
        body = "\n".join(lines)

    print(f"\n--- Admin Email ---\nSubject: {subject}\n{body}\n---")
    send_email(subject, body)

    # -----------------------------------------------------------------------
    # Notify email subscribers about tier shifts
    # -----------------------------------------------------------------------
    if all_tier_changes:
        print("\nNotifying email subscribers about tier shifts…")
        notify_subscribers(all_tier_changes, patch)

    # -----------------------------------------------------------------------
    # Create GitHub Issues for structural changes
    # -----------------------------------------------------------------------
    for role, key, reason in all_structural:
        issue_title = f"[Structural Change] {key} ({role}) — manual quiz update needed"
        issue_body = (
            f"**Detected:** {today}\n"
            f"**Patch:** {patch}\n\n"
            f"**Reason:** {reason}\n\n"
            f"### What needs to happen\n"
            f"1. Decide whether to add **{key}** to `wow-patch-data.json` under "
            f"`{role}` and/or `{SPEC_LEVEL_SECTIONS.get(role, role)}`.\n"
            f"2. Update the quiz HTML (`wow-quiz-{role}.html` or relevant file) to include the new spec/class in scoring.\n"
            f"3. Update `scripts/update_tier_data.py` → `DISPLAY_TO_KEY` map if needed.\n"
            f"4. Open a PR against main — merging deploys via GitHub Pages.\n\n"
            f"_This issue was auto-generated by the weekly tier update script._"
        )
        create_github_issue(issue_title, issue_body)

    # -----------------------------------------------------------------------
    # Exit code: non-zero if there were fetch errors but no data at all
    # -----------------------------------------------------------------------
    if fetch_errors and not all_tier_changes:
        print("\nExiting with code 1 due to fetch errors.")
        sys.exit(1)

    print("\nDone.")


if __name__ == "__main__":
    main()
