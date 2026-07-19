#!/usr/bin/env bash
#
# Semgrep runner for koa-utils.
#
# Why this script exists instead of a plain `semgrep` invocation:
# Semgrep (as of 1.169.0) does not recognise the `.mts` extension. It is absent
# from its target-selection map, so scanning src/ directly reports
# "Targets scanned: 0" — even when a .mts file is passed as an explicit
# argument. The scan silently succeeds while inspecting nothing.
#
# Workaround: mirror src/**/*.mts into a temporary shadow tree as **/*.ts with
# byte-identical content. Line numbers therefore map 1:1 and the only fixup
# needed on the way out is the extension, which we rewrite in the output so
# reported paths point at the real sources.
#
# Semgrep runs via Docker (no local install), matching the `yarn qodana` pattern.
#
# Usage:
#   ./scripts/semgrep.sh              # custom koa-utils rules
#   ./scripts/semgrep.sh --registry   # custom rules + registry packs (needs network)
#   ./scripts/semgrep.sh --json       # machine-readable output
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHADOW="$(mktemp -d)"
IMAGE="semgrep/semgrep:latest"

cleanup() { rm -rf "$SHADOW"; }
trap cleanup EXIT

# --- build shadow tree ------------------------------------------------------
# SHADOW must be exported: the `sh -c` subshell below cannot see a plain
# shell-local variable.
export SHADOW
cd "$ROOT/src"
find . -name '*.mts' -exec sh -c '
  mkdir -p "$SHADOW/$(dirname "$1")"
  cp "$1" "$SHADOW/${1%.mts}.ts"
' _ {} \;
cd "$ROOT"

COUNT=$(find "$SHADOW" -name '*.ts' | wc -l)
if [ "$COUNT" -eq 0 ]; then
  echo "semgrep: no .mts sources found under src/ — aborting" >&2
  exit 1
fi

# --- assemble config args ---------------------------------------------------
CONFIGS=(--config=/rules)
EXTRA=()
for arg in "$@"; do
  case "$arg" in
    --registry)
      CONFIGS+=(--config=p/typescript --config=p/nodejs --config=p/javascript)
      ;;
    *)
      EXTRA+=("$arg")
      ;;
  esac
done

echo "semgrep: scanning $COUNT files (shadow tree, .mts -> .ts)"

# --- run --------------------------------------------------------------------
# `|| true` so a non-zero findings exit code still reaches the path rewrite
# below; the real exit status is re-applied afterwards.
set +e
docker run --rm \
  -v "$SHADOW:/src:ro" \
  -v "$ROOT/.semgrep:/rules:ro" \
  -w /src \
  "$IMAGE" semgrep "${CONFIGS[@]}" --metrics=off --no-git-ignore "${EXTRA[@]+"${EXTRA[@]}"}" \
  2>&1 | sed -E 's/\.ts([:"[:space:]]|$)/.mts\1/g'
STATUS=${PIPESTATUS[0]}
set -e

exit "$STATUS"
