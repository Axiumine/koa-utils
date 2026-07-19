/**
 * Reject a path traversal attempt in a value that is interpolated into a filesystem path.
 *
 * Deliberately narrow: it rejects only a literal `..` path component, and still allows
 * separators, so a legitimate multi-segment value such as `2026/07` keeps working. A
 * stricter `path.basename()` would close more, but it silently rewrites `2026/07` to `07`
 * and would break published consumers — see the rule notes in .semgrep/koa-utils.yml.
 *
 * @param value the caller-supplied value
 * @param name  parameter name, used in the error message
 */
export function assertNoTraversal(value: string, name: string) {
	if (value.split(/[\\/]/).includes('..')) {
		throw new Error(`Invalid ${name}: path traversal`)
	}
}
