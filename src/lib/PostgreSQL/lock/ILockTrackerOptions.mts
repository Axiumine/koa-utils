/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ rankCheck: maybeValue }` */
/** What `track` of a lock-order tracker takes. */
export interface ILockTrackerOptions<TMode extends string = string> {
	/** The mode of the transaction. Default: the `defaultMode` of the spec. */
	readonly mode?: TMode | undefined
	/** Forces the rank check on or off for this transaction. Default: the default of the tracker. */
	readonly rankCheck?: boolean | undefined
}
