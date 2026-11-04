import { randomInt } from 'node:crypto'

import type { IRetryDelay } from '@lib/PostgreSQL/tx/IRetryDelay.mjs'
import { TX_RETRY_BASE_DELAY_MS } from '@lib/PostgreSQL/tx/TX_RETRY_BASE_DELAY_MS.mjs'

/**
 * A wait of a random length from 0 to `TX_RETRY_BASE_DELAY_MS` times two to the power of the retry number minus one,
 * both ends included ("full jitter"), so that two transactions that collided do not collide again in step.
 * `random(n)` answers a whole number from 0 up to n, n excluded; the default is `node:crypto` `randomInt`.
 */
export function jitteredDelay(random: (maxExclusive: number) => number = (max) => randomInt(max)): IRetryDelay {
	return (retry) => {
		const wait = random(TX_RETRY_BASE_DELAY_MS * 2 ** (retry - 1) + 1)
		return new Promise<void>((done) => {
			setTimeout(done, wait)
		})
	}
}
