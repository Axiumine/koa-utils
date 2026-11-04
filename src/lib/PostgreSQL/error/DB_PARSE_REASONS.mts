/**
 * The closed reasons of a failed parse (see {@link DbParseError}):
 *
 * - `MALFORMED`: the text is not in the shape the type has under the session settings the parsers expect (`infinity`,
 *   a BC date, another `DateStyle`, a letter in an integer).
 * - `OUT_OF_RANGE`: the text has the shape, but the value is not one the parsers return (`24:00:00`, a calendar date
 *   that does not exist, an instant whose UTC year is outside 1 to 9999).
 * - `TIME_HAS_SECONDS`: a `time` with non-zero seconds or a fraction of a second. Only `HH:mm` is returned, so the
 *   value is refused, never rounded.
 * - `UNSUPPORTED_TYPE`: the type has no parser here and the driver's own would hand over a `Date`
 *   (`timestamp without time zone` and its array).
 */
export const DB_PARSE_REASONS = ['MALFORMED', 'OUT_OF_RANGE', 'TIME_HAS_SECONDS', 'UNSUPPORTED_TYPE'] as const
