import { DEFAULT_LOCK_TIMEOUT_MS } from '@lib/PostgreSQL/tx/DEFAULT_LOCK_TIMEOUT_MS.mjs'
import { defaultRetryDelay } from '@lib/PostgreSQL/tx/defaultRetryDelay.mjs'
import type { ITxIsolation } from '@lib/PostgreSQL/tx/ITxIsolation.mjs'
import type { ITxOptions } from '@lib/PostgreSQL/tx/ITxOptions.mjs'
import { MAX_LOCK_TIMEOUT_MS } from '@lib/PostgreSQL/tx/MAX_LOCK_TIMEOUT_MS.mjs'
import { TX_ISOLATION_LEVELS } from '@lib/PostgreSQL/tx/TX_ISOLATION_LEVELS.mjs'
import { TX_RETRY_MAX } from '@lib/PostgreSQL/tx/TX_RETRY_MAX.mjs'
import { TX_RETRY_MAX_CEILING } from '@lib/PostgreSQL/tx/TX_RETRY_MAX_CEILING.mjs'

import type { ITxSettings } from './ITxSettings.mjs'
import { TX_BEGIN_STATEMENTS } from './TX_BEGIN_STATEMENTS.mjs'

const isWholeNumberIn = (value: number, min: number, max: number): boolean =>
	Number.isInteger(value) && value >= min && value <= max

function beginStatementsOf(isolation: ITxIsolation | undefined): readonly [string, string] {
	const statements = TX_BEGIN_STATEMENTS.get(isolation ?? 'READ COMMITTED')
	if (statements === undefined) throw new TypeError(`isolation must be one of ${TX_ISOLATION_LEVELS.join(', ')}`)
	return statements
}

function lockTimeoutMsOf(value: number | undefined): number {
	const lockTimeoutMs = value ?? DEFAULT_LOCK_TIMEOUT_MS
	if (!isWholeNumberIn(lockTimeoutMs, 1, MAX_LOCK_TIMEOUT_MS)) {
		throw new TypeError(`lockTimeoutMs must be a whole number of milliseconds from 1 to ${String(MAX_LOCK_TIMEOUT_MS)}`)
	}
	return lockTimeoutMs
}

function retryMaxOf(value: number | undefined): number {
	const retryMax = value ?? TX_RETRY_MAX
	if (!isWholeNumberIn(retryMax, 0, TX_RETRY_MAX_CEILING)) {
		throw new TypeError(`retryMax must be a whole number from 0 to ${String(TX_RETRY_MAX_CEILING)}`)
	}
	return retryMax
}

/**
 * Checks the options before anything is checked out and builds the two statements that open a transaction. The checks
 * run in the order isolation, lock timeout, retry count; the first that fails throws a `TypeError`.
 */
export function txSettings(options: ITxOptions): ITxSettings {
	const [readWrite, readOnly] = beginStatementsOf(options.isolation)
	const lockTimeoutMs = lockTimeoutMsOf(options.lockTimeoutMs)
	const retryMax = retryMaxOf(options.retryMax)
	return {
		logger: options.logger,
		errors: options.errors,
		count: options.counter ?? ((): void => undefined),
		begin: options.readOnly === true ? readOnly : readWrite,
		// The number was checked above to be a whole number in range, so the text holds digits only.
		setLockTimeout: `SET LOCAL lock_timeout = ${String(lockTimeoutMs)}`,
		retryMax,
		retryDelay: options.retryDelay ?? defaultRetryDelay
	}
}
