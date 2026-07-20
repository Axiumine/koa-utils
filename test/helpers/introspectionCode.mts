/**
 * Save/restore helpers for process.env.INTROSPECTION_CODE.
 *
 * `process.env.X = undefined` stores the literal string 'undefined' rather than clearing the
 * variable — the same coercion the introspection bypass was built on. A test that saved an
 * originally-unset value and restored it naively would leave INTROSPECTION_CODE='undefined'
 * behind, and any later test sending that header value would then match it.
 */
export const saveIntrospectionCode = (): string | undefined => process.env.INTROSPECTION_CODE

export const restoreIntrospectionCode = (saved: string | undefined): void => {
	if (typeof saved === 'undefined') {
		delete process.env.INTROSPECTION_CODE
	} else {
		process.env.INTROSPECTION_CODE = saved
	}
}
