#!/usr/bin/env bash
# Checks the layout rule: every skill lives in its own subfolder skills/<name>/SKILL.md.
set -u
cd "$(dirname "$0")/.."
errors=0
fail() { echo "skills layout: $1" >&2; errors=1; }

[ -d skills ] || { echo "skills layout: skills/ is missing" >&2; exit 1; }

shopt -s nullglob dotglob
for entry in skills/*; do
  name=${entry#skills/}
  if [ ! -d "$entry" ]; then
    fail "$entry must be inside a skill subfolder (skills/<name>/), not directly in skills/"
    continue
  fi
  if ! [[ $name =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || [ ${#name} -gt 64 ]; then
    fail "$entry: folder name must be lowercase letters, digits and hyphens (max 64 characters)"
  fi
  if [ ! -f "$entry/SKILL.md" ]; then
    fail "$entry: SKILL.md is missing"
    continue
  fi
  declared=$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} /^name:/{sub(/^name:[ \t]*/,""); print; exit}' "$entry/SKILL.md")
  if [ "$declared" != "$name" ]; then
    fail "$entry/SKILL.md: frontmatter name '$declared' must match the folder name '$name'"
  fi
  if ! awk 'NR>1 && $0=="---"{exit} /^description:[ \t]*[^ \t]/{found=1} END{exit !found}' "$entry/SKILL.md"; then
    fail "$entry/SKILL.md: frontmatter description is missing"
  fi
done
exit $errors
