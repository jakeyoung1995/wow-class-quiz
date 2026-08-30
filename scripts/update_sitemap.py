#!/usr/bin/env python3
"""
update_sitemap.py — keep sitemap <lastmod> honest.

Every entry was hand-dated, so the dates stopped matching reality the moment
anyone edited a page without remembering to edit the sitemap too. After the
$6.99 price change, 15 of 16 pages still advertised a lastmod of 2026-08-23 or
earlier — telling Google nothing had changed on the very pages whose price had
just changed.

A wrong lastmod is worse than none: it is a positive claim that a page is
unchanged, and crawlers act on it.

This derives each date from the file's last commit, which is the only record
that cannot drift from the truth.

Usage:
    python3 scripts/update_sitemap.py           # rewrite dates
    python3 scripts/update_sitemap.py --check   # exit 1 if any are stale

Stdlib only, like the rest of scripts/.
"""

import datetime
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITEMAP = os.path.join(REPO, "sitemap.xml")
SITE = "https://wowclassquiz.com/"


def is_dirty(path):
    """True if the file has uncommitted changes."""
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "--", path],
            cwd=REPO, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return bool(out)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def git_date(path):
    """The date this file last actually changed, YYYY-MM-DD.

    Uses the last commit date, except when the file has uncommitted changes —
    then it changed today, and today is the honest answer.

    Without that exception the script had a chicken-and-egg problem: it ran
    before the commit, so it stamped the *previous* commit's date, and CI then
    failed on the commit it had just been run for.
    """
    if is_dirty(path):
        return datetime.date.today().isoformat()
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cd", "--date=short", "--", path],
            cwd=REPO, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return out or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def have_history():
    """A shallow clone has no per-file history, and would silently produce
    today's date for everything. Better to skip than to write wrong dates."""
    try:
        shallow = subprocess.run(
            ["git", "rev-parse", "--is-shallow-repository"],
            cwd=REPO, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return shallow != "true"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def main():
    check_only = "--check" in sys.argv

    if not have_history():
        print("Shallow clone — no per-file history available, skipping.")
        print("Set fetch-depth: 0 on actions/checkout for this to run in CI.")
        return 0

    with open(SITEMAP, encoding="utf-8") as fh:
        xml = fh.read()

    entry = re.compile(
        r"(<loc>" + re.escape(SITE) + r"([^<]*)</loc>\s*<lastmod>)([^<]*)(</lastmod>)"
    )

    stale = []

    def replace(match):
        head, page, claimed, tail = match.groups()
        page = page or "index.html"
        if not os.path.exists(os.path.join(REPO, page)):
            return match.group(0)
        actual = git_date(page)
        if not actual or actual == claimed:
            return match.group(0)
        stale.append((page, claimed, actual))
        return head + actual + tail

    updated = entry.sub(replace, xml)

    for page, claimed, actual in stale:
        verb = "STALE " if check_only else "updated"
        print(f"  {verb} {page:32} {claimed} -> {actual}")

    if not stale:
        print("sitemap lastmod dates are accurate.")
        return 0

    if check_only:
        print(f"\n{len(stale)} stale lastmod date(s).")
        print("Run: python3 scripts/update_sitemap.py")
        return 1

    with open(SITEMAP, "w", encoding="utf-8") as fh:
        fh.write(updated)
    print(f"\nUpdated {len(stale)} lastmod date(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
