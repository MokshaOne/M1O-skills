#!/usr/bin/env bash
# Mechanical red-flag scan for a quarantined skill folder. Reads files only; runs nothing from the target.
# Usage: scan.sh <dir>
# Exit code: 0 = no hits, 1 = hits found, 2 = usage error. Hits need human judgment; a clean scan proves nothing.
set -u
export LC_ALL=C.UTF-8

dir=${1:-}
[ -d "$dir" ] || { echo "usage: scan.sh <dir>" >&2; exit 2; }

hits=0
section() { printf '\n== %s\n' "$1"; }
scan() { # scan <title> <perl-regex>
  local out
  out=$(grep -rnIP --exclude-dir=.git -e "$2" -- "$dir" 2>/dev/null | cut -c1-240)
  if [ -n "$out" ]; then section "$1"; echo "$out"; hits=1; fi
}
list() { # list <title> <find args...>
  local title=$1 out; shift
  out=$(find "$dir" -name .git -prune -o "$@" -print 2>/dev/null)
  if [ -n "$out" ]; then section "$title"; echo "$out"; hits=1; fi
}

scan "Prompt injection phrasing" '(?i)(ignore|disregard|forget|override) (all |any |the )?(previous|prior|above|earlier|system) (instructions|rules|prompts?)|do not (tell|inform|mention|reveal)[^.]{0,40}(user|human)|without (asking|telling|informing) the user|bypass(ing)? (permission|safety|approval)|dangerously'
scan "Hidden text: HTML comments" '<!--'
scan "Hidden text: invisible or bidirectional Unicode" '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{FEFF}\x{E0000}-\x{E007F}]'
scan "Download-and-run or dynamic execution" '(curl|wget)[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh|\beval\b|\bexec\s*\(|base64\s+(-d|--decode)|\bsource\s+<\(|python[0-9.]*\s+-c|node\s+-e|\bnpx\b|\buvx\b|pip[0-9.]*\s+install|npm\s+(i|install)\b'
scan "Long encoded blobs" '[A-Za-z0-9+/]{120,}={0,2}'
scan "Network access" '(?i)\b(curl|wget|nc|ncat|telnet|scp|sftp|rsync)\s|requests\.(get|post|put)|urllib|fetch\(|https?://(?!github\.com|docs\.|www\.w3\.org)[^\s)"'"'"'>]+'
scan "Credentials and secrets" '(?i)\.ssh/|\.aws/|\.netrc|\.env\b|id_rsa|id_ed25519|keychain|api[_-]?key|secret|passwor(d|t)|\btoken\b|printenv|\benv\b\s*\||os\.environ|process\.env'
scan "Destructive commands" 'rm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s|git\s+push\s+[^\n]*(--force|-f\b)|git\s+reset\s+--hard|git\s+clean\s+-|\bmkfs\b|\bdd\s+if=|chmod\s+(-R\s+)?777|git\s+config|git\s+remote\s+(add|set-url)'
scan "Harness and permission changes" '(?i)allowed-tools|settings(\.local)?\.json|\.mcp\.json|mcpServers|"hooks"|PreToolUse|PostToolUse|bypassPermissions|skip-permissions'

list "Harness files present" \( -name 'hooks.json' -o -name 'settings.json' -o -name 'settings.local.json' -o -name '.mcp.json' -o -name 'plugin.json' -o -name '.gitmodules' \)
list "Symlinks" -type l
list "Executable files" -type f -perm -u+x
list "Files over 200 KB" -type f -size +200k

binaries=$(find "$dir" -name .git -prune -o -type f -print0 2>/dev/null | xargs -0 -r grep -LI -e '' 2>/dev/null)
if [ -n "$binaries" ]; then section "Binary files"; echo "$binaries"; hits=1; fi

if [ "$hits" -eq 0 ]; then
  echo "scan: no red-flag patterns found in $dir (not proof of safety; read every file)"
  exit 0
fi
printf '\nscan: hits found in %s - judge each one\n' "$dir"
exit 1
