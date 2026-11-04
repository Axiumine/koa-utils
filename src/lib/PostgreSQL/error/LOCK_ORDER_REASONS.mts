/**
 * The closed reasons of a {@link LockOrderError}, all defects of the calling code:
 *
 * - `RANK_INVERSION`: a lock of a lower rank was requested after one of a higher rank.
 * - `MODE_REQUIRED`: a helper that belongs to another order than the default one, in a transaction that is in the default
 *   mode.
 * - `NOT_IN_MODE_ORDER`: a helper that is not one of the locks of the order of a transaction that is in a mode other than
 *   the default one.
 * - `TRACKER_STARTED`: the mode of a transaction was set after a lock was recorded in it.
 */
export const LOCK_ORDER_REASONS = ['RANK_INVERSION', 'MODE_REQUIRED', 'NOT_IN_MODE_ORDER', 'TRACKER_STARTED'] as const
