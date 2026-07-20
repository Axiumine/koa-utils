# known-gap canaries

Each file here is **genuinely vulnerable** but currently scans clean. They are not
"safe" fixtures and must never be moved to `must-not-fire/` — that would assert the
blind spot is intended behaviour.

The runner asserts they are still silent. That is a tripwire, not an endorsement:
if one starts firing, Semgrep or the ruleset improved, and the file should be
promoted to `must-fire/`. The runner says so when it happens.

Purpose: keep the gaps enumerated and visible, so "0 findings" is never read as
"no vulnerabilities of this class".
