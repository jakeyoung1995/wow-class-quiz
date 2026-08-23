#!/usr/bin/env python3
"""
check_site.py — pre-flight checks for the static site.

Runs with no dependencies (stdlib only), same as deploy.py. Used two ways:

  1. Locally, before you open a PR:   python3 scripts/check_site.py
  2. Automatically, on every PR:      .github/workflows/pr-checks.yml

ERRORs fail the build. WARNs are printed but do not fail.

Why these checks exist — each one is a bug this repo has actually shipped:
  - truncated HTML      : all 6 quiz files once shipped cut off mid-function
  - broken links        : classic-quiz-tank/healer were deleted but still linked
  - duplicate GA4       : tank + healer free quizzes double-counted every pageview
  - sitemap drift       : sitemap listed pages that no longer existed
  - leaked secrets      : this repo is public; a token was once committed
"""

import glob
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GA4_ID = "G-YMTTK4WJ3F"
SITE = "https://wowclassquiz.com"

# google*.html is a Google Search Console verification stub: a single line of
# text with an .html extension. It is not a page and must skip page-shaped checks.
NOT_A_PAGE = {"google7243f81f2f7c028a.html"}

# Pages that intentionally have no analytics / are not in the sitemap.
NO_GA4 = {"404.html"} | NOT_A_PAGE
NOT_IN_SITEMAP = {"404.html"} | NOT_A_PAGE

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def html_files():
    return sorted(os.path.basename(p) for p in glob.glob(os.path.join(REPO, "*.html")))


def read(name):
    with open(os.path.join(REPO, name), encoding="utf-8") as fh:
        return fh.read()


# ---------------------------------------------------------------- checks

def check_json():
    """wow-patch-data.json is written by the weekly scraper — a malformed
    commit there breaks tier-list.html silently in the browser."""
    path = os.path.join(REPO, "wow-patch-data.json")
    if not os.path.exists(path):
        err("wow-patch-data.json is missing")
        return
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        err(f"wow-patch-data.json is not valid JSON: {exc}")
        return
    for key in ("_meta", "dps", "dps_specs"):
        if key not in data:
            err(f"wow-patch-data.json is missing top-level key '{key}'")
    meta = data.get("_meta", {})
    for key in ("patch", "season", "last_updated"):
        if not meta.get(key):
            warn(f"wow-patch-data.json _meta.{key} is empty")


def check_not_truncated():
    """Every page must close its </html>. Catches the truncation class of bug
    that shipped broken feedback widgets to production."""
    for name in html_files():
        if name in NOT_A_PAGE:
            continue
        body = read(name).rstrip()
        if not body.endswith("</html>"):
            err(f"{name} does not end with </html> — file is likely truncated")


def check_internal_links():
    """Resolve every relative href/src to a file on disk."""
    on_disk = {
        os.path.relpath(p, REPO).replace(os.sep, "/")
        for p in glob.glob(os.path.join(REPO, "**", "*"), recursive=True)
        if os.path.isfile(p)
    }
    pattern = re.compile(r'(?:href|src)="([^"]+)"')
    for name in html_files():
        for raw in set(pattern.findall(read(name))):
            if raw.startswith(("http://", "https://", "//", "#", "mailto:", "tel:", "data:", "javascript:")):
                continue
            target = raw.split("#")[0].split("?")[0].lstrip("/")
            if not target or target == "":
                continue  # href="/" — the homepage
            if target not in on_disk:
                err(f"{name} links to '{raw}' which does not exist in the repo")


def check_ga4():
    """Exactly one gtag config per page. Two means every pageview is counted
    twice, which quietly corrupts the analytics the SEO work depends on."""
    for name in html_files():
        count = read(name).count(f"gtag('config', '{GA4_ID}')")
        if name in NO_GA4:
            continue
        if count == 0:
            err(f"{name} has no GA4 gtag config — analytics will not fire")
        elif count > 1:
            err(f"{name} has {count} GA4 gtag configs — pageviews will be counted {count}x")


def check_sitemap():
    """Sitemap and disk must agree, in both directions."""
    path = os.path.join(REPO, "sitemap.xml")
    if not os.path.exists(path):
        err("sitemap.xml is missing")
        return
    locs = re.findall(r"<loc>(.*?)</loc>", read("sitemap.xml"))
    listed = set()
    for loc in locs:
        rel = re.sub(r"^%s/?" % re.escape(SITE), "", loc)
        listed.add(rel or "index.html")
    on_disk = set(html_files()) - NOT_IN_SITEMAP
    for missing in sorted(listed - on_disk):
        err(f"sitemap.xml lists '{missing}' but that file is not in the repo")
    for absent in sorted(on_disk - listed):
        warn(f"{absent} exists but is not listed in sitemap.xml")


def check_secrets():
    """This repo is public and has leaked a token before."""
    patterns = [
        (r"ghp_[A-Za-z0-9]{20,}", "GitHub personal access token"),
        (r"github_pat_[A-Za-z0-9_]{20,}", "GitHub fine-grained token"),
        (r"gho_[A-Za-z0-9]{20,}", "GitHub OAuth token"),
        (r"AKIA[0-9A-Z]{16}", "AWS access key id"),
        (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private key"),
        (r"GH_TOKEN\s*=\s*[\"']?gh[a-z]_", "hardcoded GH_TOKEN"),
    ]
    # Docs legitimately show the shape of a token. Treat obvious stand-ins as safe.
    placeholder = re.compile(
        r"your|example|placeholder|redacted|xxx|<[A-Z_]+>|here\b|fake|dummy", re.I
    )
    skip_dirs = {".git", "__pycache__", "node_modules"}
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        for fname in files:
            path = os.path.join(root, fname)
            rel = os.path.relpath(path, REPO).replace(os.sep, "/")
            if os.path.getsize(path) > 2_000_000:
                continue
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    body = fh.read()
            except OSError:
                continue
            for pattern, label in patterns:
                for match in re.finditer(pattern, body):
                    # Look at the rest of the line: a placeholder like
                    # "GH_TOKEN=ghp_yourtokenhere" in a setup doc is not a leak.
                    line_end = body.find("\n", match.start())
                    line = body[match.start(): line_end if line_end != -1 else len(body)]
                    if placeholder.search(line):
                        continue
                    err(f"{rel} appears to contain a {label} — do not commit this")
                    break


def check_canonicals():
    """A wrong or missing canonical costs organic traffic, which is the whole
    growth channel for this site."""
    for name in html_files():
        if name in NOT_A_PAGE or name == "404.html":
            continue
        body = read(name)
        match = re.search(r'<link rel="canonical" href="([^"]+)"', body)
        if not match:
            warn(f"{name} has no canonical link")
            continue
        href = match.group(1)
        expected = f"{SITE}/" if name == "index.html" else f"{SITE}/{name}"
        if href.rstrip("/") != expected.rstrip("/"):
            warn(f"{name} canonical is '{href}', expected '{expected}'")


def check_gitignore_conflicts():
    """A file that is both tracked and gitignored is a trap: the ignore rule
    does nothing, and the next person assumes it does."""
    import subprocess
    try:
        tracked = subprocess.run(
            ["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.split()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    for name in tracked:
        # --no-index is required: without it, git refuses to report a file
        # that is already tracked, which is exactly the case we want to catch.
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "-q", name],
            cwd=REPO, capture_output=True,
        )
        if result.returncode == 0:
            warn(f"{name} is tracked by git but also matched by .gitignore — the ignore rule has no effect")


# ---------------------------------------------------------------- main

def main():
    for check in (
        check_json,
        check_not_truncated,
        check_internal_links,
        check_ga4,
        check_sitemap,
        check_secrets,
        check_canonicals,
        check_gitignore_conflicts,
    ):
        check()

    for message in warnings:
        print(f"WARN   {message}")
    for message in errors:
        print(f"ERROR  {message}")

    print()
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
