#!/usr/bin/env bash
#
# Git clean/smudge filter keeping yarn.lock registry-agnostic in history.
#
#   clean  (worktree -> git)  local proxy  -> public npm registry
#   smudge (git -> worktree)  public npm registry -> local proxy
#
# The filter definition lives in .git/config, so it only applies to clones that
# ran `install`. Everyone else checks out the public URLs verbatim.
#
# Override the proxy host per machine with YARN_PROXY_REGISTRY.

set -euo pipefail

PROXY="${YARN_PROXY_REGISTRY:-http://yarnproxy.gio.lan:4873/}"
PUBLIC='https://registry.npmjs.org/'

# Escape regex metacharacters so hosts with dots match literally.
escape() { printf '%s' "$1" | sed 's/[.[\*^$\/]/\\&/g'; }

case "${1:-}" in
	clean)
		sed "s#$(escape "$PROXY")#${PUBLIC}#g"
		;;
	smudge)
		sed "s#$(escape "$PUBLIC")#${PROXY}#g"
		;;
	install)
		git rev-parse --git-dir > /dev/null 2>&1 || exit 0
		git config filter.yarnlock-registry.clean "./scripts/lockfile-registry-filter.sh clean"
		git config filter.yarnlock-registry.smudge "./scripts/lockfile-registry-filter.sh smudge"
		# Never mark the filter required: a missing script must degrade to
		# passthrough rather than break checkout.
		git config filter.yarnlock-registry.required false

		# Reconcile the existing checkout. A fresh clone lands the public URLs
		# before this filter is configured, and git will not re-smudge a file it
		# already considers up to date — so rewrite it once, here. No-op when
		# yarn.lock already points at the proxy.
		if [ -f yarn.lock ]; then
			tmp="$(mktemp)"
			if "$0" smudge < yarn.lock > "$tmp"; then
				mv "$tmp" yarn.lock
			else
				rm -f "$tmp"
			fi
		fi
		;;
	uninstall)
		git rev-parse --git-dir > /dev/null 2>&1 || exit 0
		git config --remove-section filter.yarnlock-registry 2>/dev/null || true
		;;
	*)
		echo "usage: $0 clean|smudge|install|uninstall" >&2
		exit 1
		;;
esac
