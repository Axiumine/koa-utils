/**
 * Save/restore helpers for process.env.NODE_ENV.
 *
 * Same coercion trap as `introspectionCode.mts`: `process.env.NODE_ENV = undefined` store literal
 * string 'undefined', never clear var. Spec saving originally-unset NODE_ENV then restoring naively
 * leave NODE_ENV='undefined' behind for every later spec file in the mocha run.
 *
 * Load-bearing since the introspection env gate landed. `isIntrospectionBypassAllowed()` allowlist
 * `'development'` / `'test'` only, so a spec exercising the `x-introspectioncode` bypass must set
 * NODE_ENV itself — mocha set none, and a leaked 'undefined' from an earlier file silently turn
 * every bypass assert into a false-negative.
 */
export const saveNodeEnv = (): string | undefined => process.env.NODE_ENV

export const restoreNodeEnv = (saved: string | undefined): void => {
	if (typeof saved === 'undefined') {
		delete process.env.NODE_ENV
	} else {
		process.env.NODE_ENV = saved
	}
}
