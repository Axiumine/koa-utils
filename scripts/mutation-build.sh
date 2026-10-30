#!/usr/bin/env bash
#
# Build step for StrykerJS (stryker.config.json buildCommand).
#
# Stryker runs the command through execa without a shell, so `a && b && c` cannot
# be written inline in the config. The tests run against the built output (dist/
# from src/, dist-test/ from test/), so every mutant needs a fresh build of both.
# Same three steps as `yarn test:coverage` minus c8 and mocha.
#
# Sandbox mode: Stryker copies the project to .stryker-tmp/sandbox-*/ and runs this
# command there BEFORE it links node_modules, so the build tools (tspc) would not
# resolve. Link the repo's node_modules first when the sandbox has none. A real
# node_modules directory (in-place run, or a full checkout) is left alone.

set -euo pipefail

if [ ! -e node_modules ]; then
	dir="$PWD"
	while [ "$dir" != "/" ]; do
		dir="$(dirname "$dir")"
		if [ -d "$dir/node_modules" ] && [ -f "$dir/stryker.config.json" ]; then
			ln -s "$dir/node_modules" node_modules
			break
		fi
	done
fi

yarn run clean
yarn run build:esm
yarn run build:tests
