#!/usr/bin/env bash
#
# Caveman ultra enforcement. Two kinds of file in this repo are written in
# caveman ultra style, and that spec lives in the `caveman:caveman` skill:
#
#   - every CLAUDE.md, root and nested            (root CLAUDE.md, Rule 0)
#   - every comment inside test/**/*.mts          (test/CLAUDE.md, comment style)
#
# This script is the machine half of both rules: the documented versions are
# advisory, this one blocks.
#
# Wired as two PreToolUse hooks in .claude/settings.json:
#
#   mark   <- matcher "Skill"        records that caveman:caveman was invoked
#   check  <- matcher "Write|Edit"   blocks writes to either target without
#                                    that record
#
# Reads the hook payload as JSON on stdin, writes a PreToolUse decision as JSON
# on stdout. Fails closed: any prerequisite it cannot verify is a deny, never a
# warn-and-continue. Same standing as the coverage and Qodana gates.
#
# Escape hatch, owner only, same standing as SKIP_QODANA=1:
#   SKIP_CAVEMAN_GATE=1
#
# Copyright (C) 2026 Giovanni Manzoni
# SPDX-License-Identifier: GPL-3.0-or-later

set -uo pipefail

MODE="${1:-check}"
MARKER_DIR="${TMPDIR:-/tmp}/claude-caveman-gate"
SKILL_ID='caveman:caveman'

payload="$(cat)"

# jq parses the payload. Missing jq means we cannot read the payload at all, so
# in check mode that is a deny, not a pass.
if ! command -v jq >/dev/null 2>&1; then
	if [ "$MODE" = check ]; then
		printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"CLAUDE.md gate cannot run: jq is not installed. Install jq, then retry."},"systemMessage":"Blocked: scripts/caveman-claudemd-gate.sh needs jq. Install it (apt install jq) and retry."}'
	fi
	exit 0
fi

json_get() { printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null; }

deny() { # deny <reason-for-model> <message-for-developer>
	jq -n --arg reason "$1" --arg msg "$2" \
		'{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason},systemMessage:$msg}'
	exit 0
}

session="$(json_get '.session_id')"
[ -n "$session" ] || session='nosession'
session="$(printf '%s' "$session" | tr -c 'A-Za-z0-9._-' '_')"
marker="$MARKER_DIR/$session"

case "$MODE" in
mark)
	# Fires before the Skill tool runs. Record only our own skill; every other
	# skill invocation passes through untouched.
	if [ "$(json_get '.tool_input.skill')" = "$SKILL_ID" ]; then
		mkdir -p "$MARKER_DIR" 2>/dev/null && : >"$marker" 2>/dev/null
	fi
	exit 0
	;;
check) ;;
*)
	printf 'caveman-claudemd-gate.sh: unknown mode %s (expected mark|check)\n' "$MODE" >&2
	exit 1
	;;
esac

# ---- check mode ----

file_path="$(json_get '.tool_input.file_path')"
[ -n "$file_path" ] || exit 0

# Which rule covers this path? Anything else is none of our business.
if [ "$(basename -- "$file_path")" = 'CLAUDE.md' ]; then
	target='CLAUDE.md'
	rule='Rule 0 (root CLAUDE.md): every CLAUDE.md in this repo is written in caveman ultra style'
	retry_hint='read the level table and the Auto-Clarity section out of the skill, then retry this write'
elif printf '%s' "$file_path" | grep -qE '(^|/)test/.*\.mts$'; then
	target='test file'
	rule='the comment style rule (test/CLAUDE.md): every comment inside test/**/*.mts is written in caveman ultra style'
	retry_hint="read the level table and the Auto-Clarity section out of the skill, then retry this write. Comments only — describe()/it() description strings stay normal prose, and directive comments (eslint-disable, @ts-expect-error, c8 ignore, prettier, istanbul) are copied verbatim"
else
	exit 0
fi

# Owner escape hatch. Narrower than disabling the hook: it leaves the mark half
# and every other gate in place.
[ "${SKIP_CAVEMAN_GATE:-}" = '1' ] && exit 0

skill_installed=0
for candidate in \
	"$HOME"/.claude/plugins/cache/caveman/caveman/*/skills/caveman/SKILL.md \
	"$HOME"/.claude/skills/caveman/SKILL.md \
	"${CLAUDE_PROJECT_DIR:-.}"/.claude/skills/caveman/SKILL.md; do
	if [ -f "$candidate" ]; then
		skill_installed=1
		break
	fi
done

if [ "$skill_installed" -eq 0 ]; then
	deny \
		"Blocked by $rule. The caveman:caveman skill is not installed, and that spec lives in the skill — do not approximate it from memory. Tell the developer to install it with:
    /plugin marketplace add JuliusBrussee/caveman
    /plugin install caveman@caveman
Nothing was written." \
		"Blocked: caveman:caveman skill missing, $target not written. Install: /plugin marketplace add JuliusBrussee/caveman then /plugin install caveman@caveman"
fi

if [ ! -f "$marker" ]; then
	deny \
		"Blocked by $rule. caveman:caveman has not been invoked in this session. Run Skill(skill: \"caveman:caveman\", args: \"ultra\") first, $retry_hint. Nothing was written." \
		"Blocked: $target written without invoking the caveman:caveman skill first."
fi

exit 0
