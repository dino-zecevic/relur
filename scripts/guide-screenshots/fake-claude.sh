#!/bin/sh
# A stand-in for Claude Code in the Guide's screenshots
# (scripts/guide-screenshots.ts). It answers the setup
# check, prints a prepared conversation for its task, and runs the real hooks of
# its --settings file when told to through a pipe in $HOME/ctl/<task id>, so
# nothing typed shows in its terminal. `play <name>` streams
# $HOME/screens/<name>.ans line by line, as Claude's output comes in.
case "$1" in
  --version) echo '2.1.0 (Claude Code)'; exit 0 ;;
  auth) printf '{"loggedIn":true,"email":"alex@example.com","configDirectory":"%s"}\n' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; exit 0 ;;
  mcp) printf 'Checking MCP server health...\n\n'; exit 0 ;;
  -p) exit 0 ;;
esac
branch=$@BRANCH_VAR@
id=$(printf '%s' "$branch" | sed 's/^\([A-Z]*-[0-9]*\).*/\1/')
settings=""; prev=""
for arg in "$@"; do [ "$prev" = --settings ] && settings="$arg"; prev="$arg"; done
helper=""
[ -n "$settings" ] && helper=$(sed -n "s/.*\"command\": \"'\(.*\)' hook SessionStart\".*/\1/p" "$settings")
hook() { [ -n "$helper" ] && printf '%s' "$2" | "$helper" hook "$1"; }
hook SessionStart "{\"session_id\":\"session-$id\",\"transcript_path\":\"$HOME/transcripts/$id.jsonl\"}" > /dev/null
mkdir -p "$HOME/runs" "$HOME/ctl"
echo "$PWD" > "$HOME/runs/$id"
play() { [ -f "$1" ] && while IFS= read -r l; do printf '%s\n' "$l"; sleep 0.09; done < "$1"; }
stty -echo 2>/dev/null
printf '\033[?25l'
fifo="$HOME/ctl/$id"
rm -f "$fifo"; mkfifo "$fifo"
exec 3<>"$fifo"
[ -f "$HOME/screens/$id.ans" ] && cat "$HOME/screens/$id.ans"
play "$HOME/screens/$id.stream" &
while IFS= read -r line <&3; do
  case "$line" in
    working) hook UserPromptSubmit '{"prompt":"Go on"}' ;;
    permission) hook Notification '{"message":"Claude needs your permission to use Bash"}' ;;
    play\ *) play "$HOME/screens/${line#play }.ans" ;;
    stop) hook Stop '{"last_assistant_message":"Done."}' ;;
    usage) resets=$(( $(date +%s) + 7800 ))
      [ -n "$helper" ] && printf '{"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":%s},"seven_day":{"used_percentage":63}}}' "$resets" | "$helper" statusline > /dev/null ;;
  esac
done
