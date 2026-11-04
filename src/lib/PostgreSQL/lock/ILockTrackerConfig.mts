/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ rankCheck: maybeValue }` */
/** What `configure` of a lock-order tracker takes. */
export interface ILockTrackerConfig {
	/** The rank check for every transaction that does not say otherwise. Default `true`. */
	readonly rankCheck?: boolean | undefined
}
