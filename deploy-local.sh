#!/usr/bin/env bash
#
# Builds this package and copies the result into every consumer's node_modules inside one workspace.
#
# WHY THIS EXISTS
# ---------------
# `@axiumine/koa-utils` IS published, and that is exactly the problem while a feature is being built:
# the consumers that need an unreleased change cannot install it, and `npm publish` is a one-way door —
# a version number cannot be reused once taken. This script closes the loop locally instead, so a change
# can be exercised end to end against the real services before anything is published.
#
# It is a development tool, not a release step. The day the version it builds is published, the
# consumers install it from the registry and this script has nothing left to do for that version.
#
# RUN IT AFTER EVERY EDIT TO src/. Nothing else will: a consumer imports from its own node_modules copy,
# so an un-deployed change is invisible and the service keeps running the previous build, with no error
# anywhere to say so.
#
#   ./deploy-local.sh                  build, then deploy into $WORKSPACE
#   ./deploy-local.sh --dry-run        list what would be written, touch nothing
#   ./deploy-local.sh --no-build       deploy the existing dist/ (only if you just built it yourself)
#   WORKSPACE=/path/to/other ./deploy-local.sh
#
# ⚠️ The default workspace is deliberately ONE directory, not "everywhere this package is installed".
# There is a second, near-identical tree on this machine (`/media/nvme/websites/pizzati`) whose services
# import the same package name, and deploying an unreleased build into it would change a project nobody
# asked about — silently, because the two look alike. Point WORKSPACE at it explicitly if that is really
# what you want.

set -euo pipefail

PKG_NAME='@axiumine/koa-utils'
PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${WORKSPACE:-/media/nvme/websites/fullstack-marketplace-blueprint}"

DRY_RUN=0
BUILD=1
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=1 ;;
		--no-build) BUILD=0 ;;
		*) echo "unknown option: $arg" >&2; exit 2 ;;
	esac
done

if [ ! -d "$WORKSPACE" ]; then
	echo "workspace not found: $WORKSPACE" >&2
	exit 1
fi

if [ "$BUILD" -eq 1 ]; then
	echo "==> yarn build"
	(cd "$PKG_DIR" && yarn build)
fi

if [ ! -d "$PKG_DIR/dist" ]; then
	echo "dist/ does not exist — run without --no-build" >&2
	exit 1
fi

VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
echo "==> deploying $PKG_NAME@$VERSION into $WORKSPACE"

# Discovered by declaration, not by what happens to be installed: a repo that declares the dependency
# but has never had it installed is the case that must not be skipped silently. maxdepth 4 covers
# `<root>/<repo>/package.json` and `<root>/BEs/dev/<repo>/package.json`, which is every repo there.
mapfile -t MANIFESTS < <(
	find "$WORKSPACE" -maxdepth 4 -name package.json \
		-not -path '*/node_modules/*' \
		-exec grep -l "\"$PKG_NAME\"" {} \; | sort
)

if [ "${#MANIFESTS[@]}" -eq 0 ]; then
	echo "no consumer of $PKG_NAME found under $WORKSPACE" >&2
	exit 1
fi

DEPLOYED=0
for manifest in "${MANIFESTS[@]}"; do
	repo="$(dirname "$manifest")"
	dest="$repo/node_modules/$PKG_NAME"

	# The declared range has to admit the built version, or the next `yarn install` in that repo undoes
	# this deployment — quietly, by fetching whatever the range does allow. Reported rather than fixed:
	# editing a consumer's package.json is a commit in that consumer's repo, not a side effect of a build.
	declared="$(node -p "
		const p = require('$manifest');
		(p.dependencies ?? {})['$PKG_NAME'] ?? (p.devDependencies ?? {})['$PKG_NAME'] ?? ''
	")"
	if [ -n "$declared" ] && ! node -e "process.exit(require('semver').satisfies('$VERSION', '$declared') ? 0 : 1)" 2>/dev/null; then
		echo "    !! $(basename "$repo") declares '$declared', which does not admit $VERSION"
	fi

	if [ "$DRY_RUN" -eq 1 ]; then
		echo "    would write $dest"
		continue
	fi

	mkdir -p "$dest"
	# --delete so a file removed from dist/ disappears downstream too. Without it a deleted module keeps
	# resolving from the stale copy and the consumer never learns it is gone.
	rsync -a --delete "$PKG_DIR/dist/" "$dest/dist/"
	cp "$PKG_DIR/package.json" "$dest/package.json"

	echo "    -> $(basename "$repo")"
	DEPLOYED=$((DEPLOYED + 1))
done

if [ "$DRY_RUN" -eq 1 ]; then
	echo "==> dry run, nothing written (${#MANIFESTS[@]} consumers)"
else
	echo "==> deployed to $DEPLOYED consumer(s)"
	echo "    restart any running service — Node caches the module graph at import time."
fi
