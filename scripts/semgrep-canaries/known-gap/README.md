# known-gap canaries

Each file here is **genuinely vulnerable** but currently scans clean. They are not
"safe" fixtures and must never be moved to `must-not-fire/` — that would assert the
blind spot is intended behaviour.

The runner asserts they are still silent. That is a tripwire, not an endorsement:
if one starts firing, Semgrep or the ruleset improved, and the file should be
promoted to `must-fire/`. The runner says so when it happens. This has already
fired six times (mass assignment, cookie API, custom headers, SQL concatenation,
filter-in-a-variable, and the fs wrapper sinks); what is left is what pattern
authoring cannot reach.

## What remains, and why

`path-traversal-sink-in-callee.ts` — taint flowing INTO an arbitrary local function
that contains the fs call. Semgrep OSS does not do interprocedural taint; this was
measured across four call shapes (sync, arrow, hoisted, direct argument) and all
four are silent. This package's own wrappers (moveTempFile, reEncode, ...) are
named as sinks so the flows we ship are covered, but a helper written tomorrow is
not. Closing this generically needs Semgrep Pro's interfile analysis or a
different engine — it is not a rule-authoring problem.

Purpose: keep the gaps enumerated and visible, so "0 findings" is never read as
"no vulnerabilities of this class".
