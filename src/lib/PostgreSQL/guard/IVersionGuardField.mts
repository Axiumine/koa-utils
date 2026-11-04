import type { VERSION_GUARD_FIELDS } from './VERSION_GUARD_FIELDS.mjs'

/** One of {@link VERSION_GUARD_FIELDS}. */
export type IVersionGuardField = (typeof VERSION_GUARD_FIELDS)[number]
