---
name: new-skill
description: Create a new skill in the M1O-skills repository. Use when the user wants to add, scaffold, or draft a skill in this repo ("neuer Skill", "Skill anlegen", "add a skill").
---

# New skill

Scaffold a skill in this repository so that it loads both as part of the
`m1o-skills` plugin and from a plain `~/.claude/skills` checkout.

## Steps

1. Pick a name: lowercase letters, digits and hyphens, at most 64 characters
   (e.g. `invoice-check`). The directory name and the `name` field must match.
2. Create `skills/<name>/SKILL.md` with this frontmatter and a body:

   ```markdown
   ---
   name: <name>
   description: <what the skill does, and when Claude should use it>
   ---

   # <Title>

   <Instructions for Claude: steps, rules, examples.>
   ```

3. Write the `description` for triggering: say what the skill does and name
   the situations and phrases that should activate it. Claude sees only the
   name and description until the skill is invoked, so everything that decides
   whether it is picked belongs there. Keep it under 1024 characters.
4. Keep `SKILL.md` focused (roughly under 500 lines). Move long reference
   material into sibling files such as `reference.md`, and executable helpers
   into `scripts/`; link to them from `SKILL.md` so they are read only when
   needed.
5. Add the skill to the table in the repository `README.md`.
6. Run `claude plugin validate .` from the repository root and fix anything it
   reports.

## Rules

- One skill per directory; never put two `SKILL.md` files in one skill.
- Do not put secrets, tokens or personal data in a skill; this repository is
  shared.
- Write instructions as direct steps for Claude, not as documentation about
  the skill.
