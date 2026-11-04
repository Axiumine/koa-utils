/** The lock modes of a row: `update` is `FOR UPDATE`, `share` is `FOR SHARE`. A list to validate a mode against; the kit issues no lock clause. */
export const ROW_LOCK_MODES = ['update', 'share'] as const
