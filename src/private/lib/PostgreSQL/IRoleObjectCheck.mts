/** A grant on a schema, a function, or a table, view or sequence, checked with one call of a catalog function. */
export interface IRoleObjectCheck {
	readonly kind: 'schema' | 'function' | 'relation'
	readonly object: string
	readonly privilege: string
}
