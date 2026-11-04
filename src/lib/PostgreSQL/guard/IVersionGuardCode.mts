/**
 * The codes `guardVersion` passes to `errors.make`: `NOT_FOUND` (with the details `{ entity }`), `STALE_VERSION` and
 * `STALE_REV` (no details). The application's factory maps them to the codes of its own family.
 */
export type IVersionGuardCode = 'NOT_FOUND' | 'STALE_VERSION' | 'STALE_REV'
