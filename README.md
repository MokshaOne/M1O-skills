# M1O-skills

Skill-Ordner von MokshaOne für [Claude](https://claude.com/claude-code).
Jeder Unterordner in `skills/` ist ein Skill mit einer `SKILL.md`.

## Aufbau

```
.claude-plugin/
  plugin.json        Plugin-Manifest (m1o-skills)
  marketplace.json   Marketplace-Eintrag (mokshaone)
.claude/skills       Symlink auf skills/ – Skills sind aktiv, sobald Claude in diesem Repo läuft
skills/
  <name>/SKILL.md    ein Skill pro Ordner
```

## Installation

**Als Plugin (empfohlen)** – in Claude Code:

```
/plugin marketplace add MokshaOne/M1O-skills
/plugin install m1o-skills@mokshaone
```

Die Skills heißen dann `m1o-skills:<name>`.

**Als persönlicher Skill-Ordner** – Repo klonen und `skills/` verlinken:

```bash
git clone https://github.com/MokshaOne/M1O-skills.git ~/M1O-skills
ln -s ~/M1O-skills/skills ~/.claude/skills
```

(Falls `~/.claude/skills` schon existiert, stattdessen einzelne Skill-Ordner hinein verlinken.)

## Skills

| Skill | Zweck |
| --- | --- |
| [`new-skill`](skills/new-skill/SKILL.md) | Legt einen neuen Skill in diesem Repo an |

## Neuen Skill hinzufügen

1. Ordner `skills/<name>/` mit einer `SKILL.md` anlegen (Frontmatter `name` und `description`, danach die Anweisungen).
2. Skill in die Tabelle oben eintragen.
3. Mit `claude plugin validate .` prüfen.

Oder in Claude einfach `/new-skill` aufrufen.

## Lizenz

GPL-3.0, siehe [LICENSE](LICENSE).
