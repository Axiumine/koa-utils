import type { IRetryDelay } from '@lib/PostgreSQL/tx/IRetryDelay.mjs'
import { jitteredDelay } from '@lib/PostgreSQL/tx/jitteredDelay.mjs'

/** The default wait before a retry: `jitteredDelay()`. */
export const defaultRetryDelay: IRetryDelay = jitteredDelay()
