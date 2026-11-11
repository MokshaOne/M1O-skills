---
name: new-skill
description: Create a new skill in the M1O-skills repository. Use when the user wants to add, scaffold, or draft a skill in this repo ("neuer Skill", "Skill anlegen", "add a skill").
---

# New skill

Scaffold a skill in this repository so that it loads both as part of the
`m1o-skills` plugin and from a plain `~/.claude/skills` checkout.

## Steps

1. Pick a name: lowercase letters, digits and hyphens, at most 64 characters
   (e.g. `invoice-check`).
2. From the repository root run

   ```bash
   scripts/new-skill.sh <name> "<description>"
   ```

   It creates the skill's own subfolder `skills/<name>/` with a `SKILL.md`
   and adds a row to the table in `README.md`. Never create files directly in
   `skills/`.
3. Write the `description` for triggering: say what the skill does and name
   the situations and phrases that should activate it. Claude sees only the
   name and description until the skill is invoked, so everything that decides
   whether it is picked belongs there. Keep it under 1024 characters.
4. Replace the TODO body of `skills/<name>/SKILL.md` with the instructions.
   Keep it focused (roughly under 500 lines). Move long reference material
   into sibling files such as `reference.md`, and executable helpers into
   `scripts/` inside the skill folder; link to them from `SKILL.md` so they
   are read only when needed.
5. Run `scripts/check-skills.sh` and fix anything it reports.

Committing and pushing is automatic: when Claude finishes its turn in this
repository, the Stop hook runs `scripts/auto-push.sh`, which commits changes
under `skills/` and `README.md` and pushes the current branch. Do not commit
skill changes by hand. If the layout check fails, the hook reports the errors
and commits nothing.

## Rules

- Every skill gets its own subfolder `skills/<name>/`; the folder name and
  the `name` field must match. One `SKILL.md` per skill.
- Do not put secrets, tokens or personal data in a skill; this repository is
  shared.
- Write instructions as direct steps for Claude, not as documentation about
  the skill.
