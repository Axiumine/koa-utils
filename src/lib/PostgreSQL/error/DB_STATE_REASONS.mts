/**
 * The closed reasons of a {@link DbStateError}:
 *
 * - `LAYOUT_MISMATCH`: the process-wide registry that the clock shares between copies of this package holds a value that
 *   is not this layout of it. Another copy of the package with a different layout, or other code, put it there.
 */
export const DB_STATE_REASONS = ['LAYOUT_MISMATCH'] as const
