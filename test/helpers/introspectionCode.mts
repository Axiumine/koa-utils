/**
 * Save/restore helpers for process.env.INTROSPECTION_CODE.
 *
 * `process.env.X = undefined` store the literal string 'undefined', it never clear the variable —
 * same coercion the introspection bypass was built on. A test saving an originally-unset value then
 * restoring it naively leave INTROSPECTION_CODE='undefined' behind, and any later test sending that
 * header value then match it.
 */
export const saveIntrospectionCode = (): string | undefined => process.env.INTROSPECTION_CODE

export const restoreIntrospectionCode = (saved: string | undefined): void => {
	if (typeof saved === 'undefined') {
		delete process.env.INTROSPECTION_CODE
	} else {
		process.env.INTROSPECTION_CODE = saved
	}
}
