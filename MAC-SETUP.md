# Setting up a second machine (macOS)

Everything you need to work on this site from a MacBook, or any machine that is
not the Windows box.

---

## Why this file exists

Claude Cowork **projects do not sync between computers.** Sessions and files
follow your account, but a project (its instructions, its connected folders, its
memory) is stored locally on the machine where you created it. There is no cloud
sync for project data.

Connected folders are also per device. They point at real paths on one computer
and only work while the Claude desktop app is open on that computer.

So the fix is not an account setting. You recreate the project on the Mac and
point it at a local clone of this repo. This file is the checklist.

---

## 1. Clone the repo

```bash
cd ~/Documents
git clone https://github.com/jakeyoung1995/wow-class-quiz.git
cd wow-class-quiz
```

Recommended working path on macOS: `~/Documents/wow-class-quiz/`

---

## 2. Recreate the local only files

Three things are gitignored and will **not** come down with the clone. You have
to recreate them by hand.

### `.env` (required for deploying)

```bash
cat > .env <<'EOF'
GH_TOKEN=ghp_yourtokenhere
EOF
```

Get a token at https://github.com/settings/tokens with `repo` scope. You can
reuse the one already in the Windows copy at
`C:\Users\jakey\Documents\wow-class-quiz\.env`, or mint a second one so you can
revoke either machine independently. Second token is the better habit.

Save the file as plain UTF-8. `deploy.py` strips a BOM defensively, but a BOM is
still the most common reason it reports "GH_TOKEN not set".

### `deploy.py` and `publish-docs.py` (required for deploying)

Neither script is tracked in this repo. Copy both across from the Windows
machine (iCloud, AirDrop, a USB stick, or paste them into new files), along with
the `docs-public/` folder that `publish-docs.py` reads.

`publish-docs.py` is kept out of the repo on purpose: its secret scanner spells
out the exact strings that must stay private, so publishing it would leak them.

**You do not actually need either script.** The supported workflow is now git +
pull requests — see CLAUDE.md → Deployment. GitHub Pages builds from `main`, so
merging a PR is the deploy. Skip this step unless you specifically want the old
Contents-API push.

To authenticate git for pushing and opening PRs on this machine, install the
GitHub CLI and log in once:

```bash
brew install gh
gh auth login --hostname github.com --git-protocol https --web
```

`gh auth login` stores the credential in the macOS keychain and configures git to
use it, so `git push` and `gh pr create` both work afterwards. No `.env` needed.

### Marketing assets

`gumroad-*`, `tiktok-demo.html` and friends are gitignored as local only assets.
Copy them over if you need them. They are not part of the live site.

---

## 3. Verify the toolchain

```bash
python3 --version    # 3.9 or newer is fine
git --version
```

`deploy.py` uses only the standard library, so there is nothing to `pip install`.

Note the command name difference: it is `python deploy.py` on Windows and
`python3 deploy.py` on macOS.

---

## 4. Recreate the Cowork project on the Mac

1. Open the Claude desktop app on the MacBook.
2. Create a new Cowork project named **WoW Class Quiz**.
3. Add `~/Documents/wow-class-quiz` as a connected folder.
4. Set the project instructions to:

   > Read CLAUDE.md and update this instruction.

That is all the project config there is. `CLAUDE.md` in the repo root carries
the rest, and Claude reads it automatically once the folder is connected.

Leave the desktop app running while a session is working. Close it and the
cloud session keeps going but loses access to your local files.

---

## 5. What does not carry over

| Thing | Carries over? | Notes |
|-------|---------------|-------|
| Repo files | Yes | via `git clone` |
| `CLAUDE.md` project reference | Yes | tracked in this repo |
| `TASKS.md` | Yes | tracked in this repo |
| Chat sessions and their outputs | Yes | tied to your Claude account |
| Project config and connected folders | **No** | recreate per step 4 |
| Cowork project memory | **No** | rebuilds itself as you work |
| `.env` and the GitHub token | **No** | recreate per step 2 |
| `deploy.py` | **No** | copy across per step 2 |
| Scheduled tasks | Check | `weekly-seo-check` runs off your account, so do not create a duplicate on the Mac |

**Do not create a second `weekly-seo-check` scheduled task.** You will get two
Slack reports every Sunday and two report files fighting over the same
`seo-reports/YYYY-MM-DD.md` name.

---

## 6. Keeping two machines in sync

The repo is the source of truth. Before you start work on either machine:

```bash
git pull
```

After deploying from one machine, pull on the other.

If you use the PR workflow this is straightforward: everything goes through git,
so `git pull` is always enough. The drift problem below only applies if you still
run `deploy.py`, which pushes through the GitHub Contents API rather than a normal
git push and therefore leaves your local history behind even though the live site
is current. If `git pull` complains, this is safe:

```bash
git fetch origin
git reset --hard origin/main
```

The weekly tier scraper also commits to `main` on its own every Monday, so
expect remote changes you did not make.

---

## 7. Redacted values

The public copies of `CLAUDE.md` and `TASKS.md` in this repo replace secrets
with placeholders:

| Placeholder | Where the real value lives |
|-------------|----------------------------|
| `<NOTIFY_EMAIL>` | the admin Gmail account; also in the `update_tier_data.py` GitHub Actions config |
| `<UNLOCK_WORD>` | the Gumroad product description, and the premium quiz HTML |
| `<APPS_SCRIPT_ID>` | script.google.com, the "WoW Class Quiz Backend" project |
| `<REVOKED_TOKEN>` | revoked, no longer valid anywhere |

Keep it that way. This repo is public.

The unredacted originals stay on the Windows box at the repo root. The public
copies here are regenerated by running `python publish-docs.py` from
`C:\Users\jakey\Documents\wow-class-quiz\`, which reads `docs-public\` and pushes
those three files to the repo root. `deploy.py` does not touch them.
