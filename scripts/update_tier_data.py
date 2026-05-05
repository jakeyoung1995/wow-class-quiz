#!/usr/bin/env python3
"""
update_tier_data.py
===================
Weekly automated tier list updater for WoW Class Quiz.

Run by GitHub Actions every Monday. Fetches current tier data from Icy Veins,
compares to wow-patch-data.json, and:
  - For tier-only changes: updates the JSON and commits to main (auto-deploys via Netlify)
  - For structural changes (new specs, removed specs, new classes): opens a GitHub Issue
    for manual review instead of auto-merging.
  - Sends an email to jy.220529@gmail.com summarising what was done.

Environment variables (set as GitHub Secrets):
  GMAIL_APP_PASSWORD   — 16-char Google App Password for rottout.tv@gmail.com
  GITHUB_TOKEN         — automatically provided by GitHub Actions
  GITHUB_REPOSITORY    — automatically provided by GitHub Actions (owner/repo)
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
from html.parser import HTMLParser

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "wow-patch-data.json")
NOTIFY_EMAIL = "jy.220529@gmail.com"
FROM_EMAIL = "rottout.tv@gmail.com"

# Icy Veins tier list URLs (one per role)
ICYVEINS_URLS = {
    "dps": "https://www.icy-veins.com/wow/dps-tier-list",
    "tank": "https://www.icy-veins.com/wow/tank-tier-list",
    "healer": "https://www.icy-veins.com/wow/healer-tier-list",
}

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

# Specs not in our JSON yet that we know about (new in Midnight) — flag as structural
KNOWN_NEW_SPECS = {"Devourer Demon Hunter"}

# ---------------------------------------------------------------------------
# HTML parser: scrape tier rank from Icy Veins tier list pages
# ---------------------------------------------------------------------------
class IcyVeinsTierParser(HTMLParser):
    """
    Parses the Icy Veins tier list page.
    Looks for elements with class like 'tier-s', 'tier-a', 'tier-b', 'tier-c'
    and extracts the spec names listed within each tier group.
    """

    def __init__(self):
        super().__init__()
        self.results = {}          # spec_name -> tier letter ("S","A","B","C")
        self._current_tier = None
        self._in_spec_name = False
        self._spec_buffer = ""

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        cls = attr_dict.get("class", "")

        # Icy Veins uses divs/sections with class names like "tier-list-item-s" etc.
        # Also check for data-tier attributes as a fallback.
        tier_match = re.search(r'\btier-list-item-([sabc])\b', cls, re.I)
        if tier_match:
            self._current_tier = tier_match.group(1).upper()
            return

        # Also handle data-tier="S" style attributes
        data_tier = attr_dict.get("data-tier", "")
        if data_tier and data_tier.upper() in ("S", "A", "B", "C"):
            self._current_tier = data_tier.upper()
            return

        # Spec name spans/divs
        if self._current_tier and tag in ("span", "div", "a", "p"):
            if any(k in cls for k in ("class-name", "spec-name", "tier-list-spec", "spec")):
                self._in_spec_name = True
                self._spec_buffer = ""

    def handle_endtag(self, tag):
        if self._in_spec_name and tag in ("span", "div", "a", "p"):
            name = self._spec_buffer.strip()
            if name and self._current_tier:
                self.results[name] = self._current_tier
            self._in_spec_name = False
            self._spec_buffer = ""

    def handle_data(self, data):
        if self._in_spec_name:
            self._spec_buffer += data


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


def parse_tier_list(html: str, role: str) -> dict:
    """
    Parse an Icy Veins tier list page and return a dict:
      { our_json_key: best_tier_letter }
    For classes with multiple specs, we take the best (highest) tier across specs.
    """
    parser = IcyVeinsTierParser()
    parser.feed(html)
    raw = parser.results  # spec display name → tier

    # If the parser found nothing (page structure changed), try a regex fallback
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

    return aggregated


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


# ---------------------------------------------------------------------------
# Detect structural vs tier-only changes
# ---------------------------------------------------------------------------
def classify_changes(old_data: dict, new_tiers: dict, role: str) -> dict:
    """
    Returns:
      {
        'tier_changes': [(key, old_tier, new_tier), ...],
        'structural': [(key, reason), ...]   # new specs, removed specs
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
def send_email(subject: str, body: str):
    """Send a plain-text notification email via Gmail SMTP."""
    password = os.environ.get("GMAIL_APP_PASSWORD", "")
    if not password:
        print("WARNING: GMAIL_APP_PASSWORD not set — skipping email")
        return

    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = NOTIFY_EMAIL

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(FROM_EMAIL, password)
            server.sendmail(FROM_EMAIL, [NOTIFY_EMAIL], msg.as_string())
        print(f"Email sent to {NOTIFY_EMAIL}")
    except Exception as e:
        print(f"Failed to send email: {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    # Load current data file
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    today = date.today().isoformat()
    patch = data["_meta"].get("patch", "unknown")

    all_tier_changes = []
    all_structural = []
    fetch_errors = []

    print(f"WoW Class Quiz — Tier Update Run ({today}, patch {patch})")
    print("=" * 60)

    for role, url in ICYVEINS_URLS.items():
        print(f"\nFetching {role} tier list from {url} ...")
        try:
            html = fetch_tier_page(url)
        except Exception as e:
            msg = f"Failed to fetch {role} tier list: {e}"
            print(f"  ERROR: {msg}")
            fetch_errors.append(msg)
            continue

        new_tiers = parse_tier_list(html, role)
        print(f"  Parsed {len(new_tiers)} entries: {new_tiers}")

        if not new_tiers:
            msg = f"No tier data parsed for {role} — Icy Veins page structure may have changed"
            print(f"  WARNING: {msg}")
            fetch_errors.append(msg)
            continue

        changes = classify_changes(data, new_tiers, role)
        all_tier_changes.extend([(role, *c) for c in changes["tier_changes"]])
        all_structural.extend([(role, *c) for c in changes["structural"]])

        # Apply tier changes to data
        for key, old_tier, new_tier in changes["tier_changes"]:
            data[role][key]["mplus"] = new_tier
            data[role][key]["raid"] = new_tier  # Icy Veins overall rank used for both
            print(f"  Updated {key}: {old_tier} → {new_tier}")

    # Update metadata
    data["_meta"]["last_updated"] = today
    if all_tier_changes or not fetch_errors:
        data["_meta"]["needs_refresh"] = False  # we have fresh data

    # Log changes
    if all_tier_changes:
        data["changelog"].append({
            "date": today,
            "patch": patch,
            "changes": [
                {"role": r, "key": k, "from": o, "to": n}
                for r, k, o, n in all_tier_changes
            ]
        })
        # Keep only last 20 changelog entries
        data["changelog"] = data["changelog"][-20:]

    # Write updated JSON
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\nWrote updated {DATA_FILE}")

    # -----------------------------------------------------------------------
    # Build email + issue content
    # -----------------------------------------------------------------------
    if not all_tier_changes and not all_structural and not fetch_errors:
        subject = f"[WoW Class Quiz] No tier changes this week (patch {patch})"
        body = (
            f"Weekly tier check ran on {today}.\n\n"
            f"No tier changes detected for patch {patch} / {data['_meta'].get('season', '')}.\n"
            f"No action taken.\n"
        )
    else:
        lines = [f"Weekly tier update report — {today} — patch {patch}\n"]

        if all_tier_changes:
            lines.append("TIER CHANGES (auto-committed to main):")
            for role, key, old_t, new_t in all_tier_changes:
                lines.append(f"  [{role.upper()}] {key}: {old_t} → {new_t}")
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

        subject = f"[WoW Class Quiz] Tier update — {len(all_tier_changes)} change(s), {len(all_structural)} structural"
        body = "\n".join(lines)

    print(f"\n--- Email ---\nSubject: {subject}\n{body}\n---")
    send_email(subject, body)

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
            f"1. Decide whether to add **{key}** to `wow-patch-data.json` under `{role}`.\n"
            f"2. Update the quiz HTML (`wow-quiz-{role}.html` or relevant file) to include the new spec/class in scoring.\n"
            f"3. Update `scripts/update_tier_data.py` → `DISPLAY_TO_KEY` map if needed.\n"
            f"4. Commit and push to main — Netlify will auto-deploy.\n\n"
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
