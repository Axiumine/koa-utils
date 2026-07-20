#!/usr/bin/env bash
#
# Canary runner for the koa-utils semgrep ruleset.
#
# Why this exists:
# `yarn semgrep` reporting "0 findings" is only meaningful if the rules can still
# detect anything at all. A rule that has been narrowed, typo'd, or silently broken
# by a Semgrep upgrade also reports 0 — indistinguishable from a clean codebase.
# This script proves the difference by running the real rules against fixtures with
# known expected outcomes.
#
# Three buckets under scripts/semgrep-canaries/:
#   must-fire/     vulnerable  -> MUST produce >=1 finding (and the rule named in the
#                                 file's `// expect:` comment must be among them)
#   must-not-fire/ safe        -> MUST produce 0 findings (false-positive guard)
#   known-gap/     vulnerable  -> currently produces 0 findings, by documented
#                                 Semgrep OSS limitation. Asserted silent as a
#                                 tripwire: if one starts firing, that is an
#                                 improvement and the file must be promoted to
#                                 must-fire/. Failing here is intentional — it keeps
#                                 the documented gap list from going stale.
#
# Fixtures are plain .ts (not .mts), so no shadow tree is needed — see scripts/semgrep.sh
# for why the main scan requires one.
#
# Usage: ./scripts/semgrep-canary.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANARIES="$ROOT/scripts/semgrep-canaries"
IMAGE="semgrep/semgrep:latest"

[ -d "$CANARIES" ] || { echo "canary: $CANARIES not found" >&2; exit 1; }

echo "semgrep-canary: running ruleset against fixtures"

# No --error here: this script decides pass/fail from the findings themselves,
# so semgrep's own exit code is deliberately not the signal.
JSON="$(docker run --rm \
  -v "$CANARIES:/src:ro" \
  -v "$ROOT/.semgrep:/rules:ro" \
  -w /src \
  "$IMAGE" semgrep --config=/rules --metrics=off --no-git-ignore --json 2>/dev/null)"

export CANARIES

echo "$JSON" | python3 -c '
import json, sys, os, re, collections

data = json.load(sys.stdin)
root = os.environ["CANARIES"]

hits = collections.defaultdict(set)
for f in data.get("results", []):
    hits[f["path"].lstrip("./")].add(f["check_id"].split(".")[-1])

def bucket(name):
    d = os.path.join(root, name)
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if f.endswith(".ts"))

def expected_rule(bucket_name, fname):
    with open(os.path.join(root, bucket_name, fname)) as fh:
        m = re.search(r"//\s*expect:\s*(\S+)", fh.read())
    return m.group(1).split(".")[-1] if m else None

fails, notes = [], []

for f in bucket("must-fire"):
    key = f"must-fire/{f}"
    got = hits.get(key, set())
    want = expected_rule("must-fire", f)
    if not got:
        label = want or "any rule"
        fails.append(f"MUST-FIRE but silent: {key} (expected {label})")
    elif want and want not in got:
        fails.append(f"MUST-FIRE wrong rule: {key} expected {want}, got {sorted(got)}")

for f in bucket("must-not-fire"):
    key = f"must-not-fire/{f}"
    got = hits.get(key, set())
    if got:
        fails.append(f"FALSE POSITIVE: {key} should be silent, fired {sorted(got)}")

for f in bucket("known-gap"):
    key = f"known-gap/{f}"
    got = hits.get(key, set())
    if got:
        fails.append(
            f"KNOWN-GAP now detected: {key} fired {sorted(got)}. "
            "This is an improvement — promote the file to must-fire/ and update "
            "the gap notes in .semgrep/koa-utils.yml."
        )
    else:
        notes.append(key)

nf, nn, ng = len(bucket("must-fire")), len(bucket("must-not-fire")), len(bucket("known-gap"))
fired = sum(1 for f in bucket("must-fire") if hits.get(f"must-fire/{f}"))
silent = sum(1 for f in bucket("must-not-fire") if not hits.get(f"must-not-fire/{f}"))

print(f"  must-fire     {fired}/{nf} fired")
print(f"  must-not-fire {silent}/{nn} silent")
print(f"  known-gap     {len(notes)}/{ng} still invisible (documented blind spots)")

if fails:
    print("\nFAIL:")
    for x in fails:
        print(f"  - {x}")
    sys.exit(1)

print("\nOK: ruleset detects what it claims to detect.")
'
