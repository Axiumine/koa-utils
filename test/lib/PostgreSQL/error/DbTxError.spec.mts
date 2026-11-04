import { DB_TX_REASONS } from '@lib/PostgreSQL/error/DB_TX_REASONS.mjs'
import { DbTxError } from '@lib/PostgreSQL/error/DbTxError.mjs'
import { expect } from 'chai'

describe('DbTxError', () => {
	it('DB_TX_REASONS holds the two closed reasons, in order', () => {
		expect([...DB_TX_REASONS]).to.deep.equal(['HANDLE_CLOSED', 'COMMIT_ROLLED_BACK'])
	})

	for (const reason of DB_TX_REASONS) {
		it(`carries the reason ${reason} and a fixed message`, () => {
			const error = new DbTxError(reason)
			expect(error).to.be.instanceOf(Error)
			expect(error.name).to.equal('DbTxError')
			expect(error.reason).to.equal(reason)
			expect(error.message).to.equal(`database transaction misused: ${reason}`)
			expect(error.cause).to.equal(undefined)
		})
	}
})
