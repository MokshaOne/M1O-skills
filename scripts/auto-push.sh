#!/usr/bin/env bash
# Auto-push: commits changes under skills/ (and README.md) and pushes the current branch.
# Runs as a Claude Code Stop hook (.claude/settings.json); can also be run by hand.
set -u
cd "$(dirname "$0")/.."

input=""
[ -t 0 ] || input=$(cat)

# Layout rule first: every skill in its own subfolder. Exit 2 hands the errors back to Claude.
if ! scripts/check-skills.sh; then
  case $input in
    *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;
  esac
  echo "auto-push: fix the skills layout above, nothing was committed" >&2
  exit 2
fi

branch=$(git symbolic-ref --quiet --short HEAD) || { echo "auto-push: detached HEAD, skipping" >&2; exit 0; }

git add -A -- skills README.md
if ! git diff --cached --quiet; then
  changed=$(git diff --cached --name-only -- skills | cut -d/ -f2 | sort -u | paste -sd, - | sed 's/,/, /g')
  git commit -q -m "skills: update ${changed:-README}" || { echo "auto-push: commit failed" >&2; exit 0; }
  echo "auto-push: committed (${changed:-README})"
fi

# Push when the remote branch is missing or behind the local one.
if git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null &&
   [ -z "$(git rev-list "origin/$branch..HEAD")" ]; then
  exit 0
fi
if out=$(git push -u origin "$branch" 2>&1); then
  echo "auto-push: pushed $branch"
else
  echo "auto-push: push failed, commits stay local:" >&2
  echo "$out" | tail -3 >&2
fi
exit 0
