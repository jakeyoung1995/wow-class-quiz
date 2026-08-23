#!/usr/bin/env python3
"""
patch_watch.py — detect a WoW patch going live, and a new patch entering PTR.

Runs far more often than the weekly tier scraper because the point is latency:
a patch goes live and the site should say so within minutes, not next Monday.

Two independent signals, both from Blizzard's own CDN version endpoint:

  LIVE     `wow` / `wow_classic` version changes      -> the patch has shipped
  PTR      `wowt` minor version exceeds live's        -> prep window is open

Exit codes let the workflow branch without parsing stdout:
  0  nothing changed
  10 a patch went live      (workflow stamps + commits + deploys)
  11 a new patch hit PTR    (workflow opens a prep issue)
  1  error

Stdlib only.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_tier_data import fetch_live_patch  # noqa: E402  (shared, single source)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, "wow-patch-data.json")

EXIT_NOCHANGE, EXIT_LIVE, EXIT_PTR, EXIT_ERROR = 0, 10, 11, 1


def minor_of(patch: str):
    """'12.1' and '12.1.5' both -> (12, 1). Used to tell a real patch from a
    hotfix build bump, which we do not want to announce."""
    try:
        parts = patch.split(".")
        return int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        return None


def main():
    if not os.path.exists(DATA):
        print("ERROR: wow-patch-data.json not found")
        return EXIT_ERROR
    with open(DATA, encoding="utf-8") as fh:
        data = json.load(fh)
    meta = data.get("_meta", {})
    known_patch = meta.get("patch", "")
    known_build = str(meta.get("build", ""))

    live = fetch_live_patch("wow")
    if not live:
        # Unreachable endpoint is not a failure worth alarming on; the next
        # run in a few minutes will retry.
        print("Blizzard endpoint unreachable — no decision made.")
        return EXIT_NOCHANGE

    print(f"recorded: patch {known_patch} build {known_build or '?'}")
    print(f"live    : patch {live['patch']} build {live['build']}")

    if live["patch"] != known_patch:
        print(f"::notice::PATCH LIVE {known_patch} -> {live['patch']} "
              f"(build {live['build']})")
        _emit({"event": "patch_live", "from": known_patch, "to": live["patch"],
               "build": live["build"]})
        return EXIT_LIVE

    if live["build"] != known_build:
        # Same patch, new build: a hotfix. Worth recording, not worth shouting.
        print(f"Hotfix build {known_build or '?'} -> {live['build']} "
              f"(patch unchanged at {live['patch']})")
        _emit({"event": "hotfix", "patch": live["patch"], "build": live["build"]})
        return EXIT_NOCHANGE

    ptr = fetch_live_patch("wowt")
    if ptr:
        live_minor, ptr_minor = minor_of(live["patch"]), minor_of(ptr["patch"])
        if live_minor and ptr_minor and ptr_minor > live_minor:
            print(f"::notice::PTR has {ptr['patch']} while live is {live['patch']} "
                  f"— prep window open")
            _emit({"event": "ptr_ahead", "live": live["patch"],
                   "ptr": ptr["patch"], "build": ptr["build"]})
            return EXIT_PTR
        print(f"ptr     : patch {ptr['patch']} build {ptr['build']} (not ahead)")

    print("No change.")
    return EXIT_NOCHANGE


def _emit(payload):
    """Write the decision where the workflow can read it without re-parsing."""
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            for key, value in payload.items():
                fh.write(f"{key}={value}\n")
    print(json.dumps(payload))


if __name__ == "__main__":
    sys.exit(main())
