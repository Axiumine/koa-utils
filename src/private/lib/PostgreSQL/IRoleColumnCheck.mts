/** A column-level grant, checked with one catalog row per column. */
export interface IRoleColumnCheck {
	readonly kind: 'columns'
	readonly object: string
	readonly privilege: string
	readonly columns: readonly string[]
}
