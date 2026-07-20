// Anchored allowlist: an absolute path under /x/ and nothing else. The leading `/x/` is
// literal, so a protocol-relative target ('//evil.com') and an absolute URL
// ('https://evil.com') both fail before the character class is ever consulted.
const ALLOW_ENCODED_URLS_AFTER_X = /^\/x\/[a-zA-Z0-9._\-%/]+$/

/**
 * Is this value safe to hand to `ctx.redirect()`?
 *
 * Exists as a named, tested function rather than an inline regex test because guard
 * *strength* is invisible to static analysis: Semgrep accepts any `if (re.test(x))` or
 * `if (x.startsWith(p))` as a sanitizer without evaluating what the pattern actually
 * admits. Replacing this call with `link.startsWith('/')` was verified to pass both the
 * semgrep scan and the full test suite while accepting '//evil.com' — a real open
 * redirect. The regex therefore lives here, behind tests that pin the attack strings it
 * must reject, and koa-utils.open-redirect.unvalidated recognises only this function as
 * a sanitizer so an ad-hoc replacement is reported instead of silently trusted.
 *
 * Deliberately strict: same-origin absolute paths under the /x/ prefix only. Percent
 * encoding is allowed (the prefix is still literal, so an encoded separator cannot
 * escape the path into an authority), but scheme-relative and absolute URLs are not.
 *
 * @param value the candidate redirect target, typically attacker-influenced
 */
export function isSafeRedirectTarget(value: string): boolean {
	return ALLOW_ENCODED_URLS_AFTER_X.test(value)
}
