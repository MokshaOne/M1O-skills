# M1O-skills

Skill-Ordner von MokshaOne für [Claude](https://claude.com/claude-code).
Jeder Unterordner in `skills/` ist ein Skill mit einer `SKILL.md`.

## Aufbau

```
.claude-plugin/
  plugin.json        Plugin-Manifest (m1o-skills)
  marketplace.json   Marketplace-Eintrag (mokshaone)
.claude/
  skills             Symlink auf skills/ – Skills sind aktiv, sobald Claude in diesem Repo läuft
  settings.json      Stop-Hook für den Auto-Push
scripts/
  new-skill.sh       legt einen neuen Skill in einem eigenen Unterordner an
  check-skills.sh    prüft die Ordnerstruktur
  auto-push.sh       committet und pusht Skill-Änderungen
skills/
  <name>/SKILL.md    jeder Skill in seinem eigenen Unterordner
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
| [`audit-skill-link`](skills/audit-skill-link/SKILL.md) | Prüft geteilte Skill-Links auf Sicherheit und übernimmt sie zweisprachig (DE/EN) ins Repo |

## Neuen Skill hinzufügen

```bash
scripts/new-skill.sh mein-skill "Was der Skill tut und wann Claude ihn nutzen soll"
```

Das legt den Unterordner `skills/mein-skill/` mit einer `SKILL.md` an und trägt den Skill in die Tabelle oben ein. In Claude geht dasselbe mit `/new-skill`.

Regel: Jeder Skill liegt in einem eigenen Unterordner `skills/<name>/`, und `name` in der `SKILL.md` entspricht dem Ordnernamen. `scripts/check-skills.sh` prüft das.

## Auto-Push

Wenn Claude in diesem Repo eine Antwort beendet, läuft über den Stop-Hook in `.claude/settings.json` das Skript `scripts/auto-push.sh`:

1. Es prüft die Ordnerstruktur. Bei Fehlern wird nichts committet, und Claude bekommt die Fehler zurückgemeldet.
2. Es committet Änderungen unter `skills/` und an `README.md` als `skills: update <namen>`.
3. Es pusht den aktuellen Branch nach `origin`. Schlägt der Push fehl, bleiben die Commits lokal und der nächste Lauf versucht es erneut.

Ohne Claude lässt sich das Skript auch direkt aufrufen: `scripts/auto-push.sh`.

## Lizenz

GPL-3.0, siehe [LICENSE](LICENSE).
