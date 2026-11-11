#!/usr/bin/env bash
# Creates a new skill in its own subfolder: skills/<name>/SKILL.md
# Usage: scripts/new-skill.sh <name> ["description"]
set -eu
cd "$(dirname "$0")/.."

name=${1:-}
description=${2:-"TODO: what this skill does, and when Claude should use it"}

if ! [[ $name =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || [ ${#name} -gt 64 ]; then
  echo "usage: scripts/new-skill.sh <name> [\"description\"]" >&2
  echo "name: lowercase letters, digits and hyphens, max 64 characters (e.g. invoice-check)" >&2
  exit 1
fi
if [ -e "skills/$name" ]; then
  echo "skills/$name already exists" >&2
  exit 1
fi

mkdir -p "skills/$name"
cat > "skills/$name/SKILL.md" <<SKILL
---
name: $name
description: $description
---

# $name

TODO: instructions for Claude – steps, rules, examples.
SKILL

# Add the skill to the table in README.md (after the last table row).
if [ -f README.md ] && ! grep -q "skills/$name/SKILL.md" README.md; then
  row="| [\`$name\`](skills/$name/SKILL.md) | $description |"
  last=$(grep -n '^| \[`' README.md | tail -1 | cut -d: -f1 || true)
  if [ -n "$last" ]; then
    awk -v n="$last" -v row="$row" '{print} NR==n{print row}' README.md > README.md.tmp && mv README.md.tmp README.md
  fi
fi

echo "created skills/$name/SKILL.md"
