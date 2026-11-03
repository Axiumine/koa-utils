#!/usr/bin/env bash
#
# Mutation-test only the src files changed against a base ref.
#
# Usage:
#   scripts/mutation-changed.sh [base-ref] [extra stryker args…]
#
# base-ref defaults to origin/main, else HEAD~1. The base is resolved with
# `git merge-base`, so a branch is compared with where it forked, not with the
# moving tip of main. Files not in the stryker `mutate` set (interfaces, type
# files, checkForNSFW) carry no mutants, so naming them is harmless. The CLI --mutate replaces
# the negations in the config, which is why they are not repeated here.
#
# Uses its own incremental file (reports/stryker-incremental-changed.json) so a
# partial run never overwrites the full-run file the weekly workflow caches. Only the
# clear-text reporter runs: the html and json reports have fixed paths in the config
# and a partial run must not replace the full-run report.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

base="${1:-}"
if [ "$#" -gt 0 ]; then
	shift
fi
if [ -z "$base" ]; then
	if git rev-parse --verify --quiet origin/main > /dev/null; then
		base="origin/main"
	else
		base="HEAD~1"
	fi
fi

if ! base_sha="$(git merge-base "$base" HEAD 2> /dev/null)"; then
	echo "mutation:changed: cannot resolve a merge base for '$base'." >&2
	echo "Pass a ref that exists: yarn mutation:changed <ref>" >&2
	exit 1
fi

# ACMR: added, copied, modified, renamed. A deleted file has nothing to mutate.
mapfile -t files < <(git diff --name-only --diff-filter=ACMR "$base_sha" HEAD -- 'src/**/*.mts' 'src/*.mts')

if [ "${#files[@]}" -eq 0 ]; then
	echo "mutation:changed: no src/*.mts changed since $base_sha — nothing to mutate."
	exit 0
fi

echo "mutation:changed: ${#files[@]} file(s) changed since $base_sha:"
printf '  %s\n' "${files[@]}"

mutate="$(IFS=,; echo "${files[*]}")"

exec yarn -s mutation \
	--mutate "$mutate" \
	--incrementalFile reports/stryker-incremental-changed.json \
	--reporters clear-text \
	"$@"
