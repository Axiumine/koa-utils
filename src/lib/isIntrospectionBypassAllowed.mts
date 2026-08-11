/**
 * May the `x-introspectioncode` authentication bypass run in this process at all?
 *
 * True only when `process.env.NODE_ENV` is exactly `'development'` or `'test'`. Every other value
 * — including unset, empty, `'Production'`, `'prod'` and `'staging'` — returns `false`.
 *
 * ⚠️ This is an allowlist, and it must stay one. Do not "simplify" it to
 * `process.env.NODE_ENV !== 'production'`. The two forms differ only on unrecognised values, and
 * that difference is the entire point: the negated form fails *open* on exactly the input most
 * likely to be wrong. An unset or empty `NODE_ENV` is the ordinary failure of a container runtime,
 * and `'Production'` / `'prod'` / `'staging'` are the ordinary failures of a deploy script — under
 * the negated form every one of them enables an authentication bypass in production, silently.
 * Under the allowlist an unrecognised value refuses, so a mislabelled environment loses a
 * development convenience instead of opening authentication.
 *
 * Exported because consumers already maintain their own copy of this predicate: the bypass is only
 * coherent while the library and the app agree on which environments are permitted to use it.
 */
export function isIntrospectionBypassAllowed(): boolean {
	const nodeEnv = process.env.NODE_ENV

	return nodeEnv === 'development' || nodeEnv === 'test'
}
