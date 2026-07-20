# known-gap canaries

Each file here is **genuinely vulnerable** but currently scans clean. They are not
"safe" fixtures and must never be moved to `must-not-fire/` — that would assert the
blind spot is intended behaviour.

The runner asserts they are still silent. That is a tripwire, not an endorsement:
if one starts firing, Semgrep or the ruleset improved, and the file should be
promoted to `must-fire/`. The runner says so when it happens. That has now fired
eight times (mass assignment, cookie API, custom headers, SQL concatenation,
filter-in-a-variable, spread-filter-in-a-variable, own-wrapper sinks, and the
private helper holding the sink).

## What remains

**Cross-file flows.** Semgrep OSS taint is intra-file only: a source in one module
and a sink in another are never linked, no matter how the rule is written. The two
`crossfile-taint-*.ts` files are one vulnerability split across a module boundary.
Real instances exist in this codebase and are noted on the redis rule
(`logout.mts:22`, `refresh.mts:52`), where the value is laundered through
`ctx.state`.

Closing this needs interfile analysis. `--pro` provides it and refuses to run
unlicensed ("This is a proprietary extension of semgrep"), so it is a purchasing
decision, not a rule-authoring one. The standing mitigation is the invariant
documented at each write site: `ctx.state.user.refreshToken` is only ever set from
`verifySignedRefreshToken`'s return value.

**Consumer misuse of the public API.** Out of reach of any analysis of this repo,
by construction. `assertNoTraversal` is the runtime guard at that boundary.

Do not let this directory reaching zero files be read as "no blind spots". It
would mean the enumerated ones are closed — nothing more.
