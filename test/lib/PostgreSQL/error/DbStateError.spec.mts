import { DB_STATE_REASONS } from '@lib/PostgreSQL/error/DB_STATE_REASONS.mjs'
import { DbStateError } from '@lib/PostgreSQL/error/DbStateError.mjs'
import { expect } from 'chai'

describe('DbStateError', () => {
	it('DB_STATE_REASONS holds the one closed reason', () => {
		expect([...DB_STATE_REASONS]).to.deep.equal(['LAYOUT_MISMATCH'])
	})

	it('carries the reason, a fixed message that says what to do, and no cause', () => {
		const error = new DbStateError('LAYOUT_MISMATCH')
		expect(error).to.be.instanceOf(Error)
		expect(error.name).to.equal('DbStateError')
		expect(error.reason).to.equal('LAYOUT_MISMATCH')
		expect(error.message).to.equal(
			'shared state of the PostgreSQL kit refused: LAYOUT_MISMATCH: keep one version of @axiumine/koa-utils installed'
		)
		expect(error.cause).to.equal(undefined)
	})
})
