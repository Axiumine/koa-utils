/**
 * What `createLockOrderTracker` takes: the order of the locks of each mode, the rank each helper takes, and the mode a
 * transaction is in until it says otherwise. The names are yours (`'standard'`, `'group'`, `'lockGroupShare'`); the kit
 * ships no order. The spec is checked once, when the tracker is made, and copied: changing the object afterwards changes
 * nothing.
 */
export interface ILockOrderSpec<TMode extends string = string, THelper extends string = string> {
	/** The ranks of each mode, lowest first, as distinct names. The rank of a name is its position, counted from 1. */
	readonly orders: Readonly<Record<TMode, readonly string[]>>
	/**
	 * The rank each helper takes, by mode. A mode left out, or `undefined`, means the helper does not belong to that
	 * order. A helper must take a rank in at least one mode, and the name must be in the order of that mode.
	 */
	readonly helpers: Readonly<Record<THelper, { readonly [TKey in NoInfer<TMode>]?: string | undefined }>>
	/** The mode of a transaction that was not given one. */
	readonly defaultMode: NoInfer<TMode>
}
