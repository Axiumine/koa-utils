import { DEFAULT_LOCK_TIMEOUT_MS } from '@lib/PostgreSQL/tx/DEFAULT_LOCK_TIMEOUT_MS.mjs'
import { MAX_LOCK_TIMEOUT_MS } from '@lib/PostgreSQL/tx/MAX_LOCK_TIMEOUT_MS.mjs'
import { TX_FAILURE_REASONS } from '@lib/PostgreSQL/tx/TX_FAILURE_REASONS.mjs'
import { TX_ISOLATION_LEVELS } from '@lib/PostgreSQL/tx/TX_ISOLATION_LEVELS.mjs'
import { TX_RETRY_BASE_DELAY_MS } from '@lib/PostgreSQL/tx/TX_RETRY_BASE_DELAY_MS.mjs'
import { TX_RETRY_MAX } from '@lib/PostgreSQL/tx/TX_RETRY_MAX.mjs'
import { TX_RETRY_MAX_CEILING } from '@lib/PostgreSQL/tx/TX_RETRY_MAX_CEILING.mjs'
import { expect } from 'chai'

describe('tx constants', () => {
	it('offers exactly the three isolation levels, in order', () => {
		expect([...TX_ISOLATION_LEVELS]).to.deep.equal(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'])
	})

	it('names exactly the two failure reasons, in order', () => {
		expect([...TX_FAILURE_REASONS]).to.deep.equal(['TX_RETRY_EXHAUSTED', 'LOCK_TIMEOUT'])
	})

	it('has the documented numbers', () => {
		expect(DEFAULT_LOCK_TIMEOUT_MS).to.equal(3_000)
		// 2^31 - 1 = largest 32-bit count server take
		expect(MAX_LOCK_TIMEOUT_MS).to.equal(2 ** 31 - 1)
		expect(TX_RETRY_MAX).to.equal(2)
		expect(TX_RETRY_MAX_CEILING).to.equal(10)
		expect(TX_RETRY_BASE_DELAY_MS).to.equal(25)
	})
})
