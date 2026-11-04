import type { LOCK_ORDER_REASONS } from './LOCK_ORDER_REASONS.mjs'

/** One of {@link LOCK_ORDER_REASONS}. */
export type ILockOrderReason = (typeof LOCK_ORDER_REASONS)[number]
