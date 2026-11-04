import { DB_CONNECT_REASONS } from '@lib/PostgreSQL/error/DB_CONNECT_REASONS.mjs'
import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { expect } from 'chai'

describe('DbConnectError', () => {
	it('DB_CONNECT_REASONS holds the four closed reasons, in order', () => {
		expect([...DB_CONNECT_REASONS]).to.deep.equal(['URL_INVALID', 'CONNECT_TIMEOUT', 'CONNECT_FAILED', 'TIMEZONE_NOT_UTC'])
	})

	for (const reason of DB_CONNECT_REASONS) {
		it(`carries the reason ${reason} and a fixed message`, () => {
			const error = new DbConnectError(reason)
			expect(error).to.be.instanceOf(Error)
			expect(error.name).to.equal('DbConnectError')
			expect(error.reason).to.equal(reason)
			expect(error.code).to.equal(undefined)
			expect(error.message).to.equal(`database connection refused: ${reason}`)
			expect(error.cause).to.equal(undefined)
		})
	}

	it('keeps a short code', () => {
		expect(new DbConnectError('CONNECT_FAILED', 'ECONNREFUSED').code).to.equal('ECONNREFUSED')
		expect(new DbConnectError('CONNECT_FAILED', '28P01').code).to.equal('28P01')
		expect(new DbConnectError('CONNECT_FAILED', 'x').code).to.equal('x')
		// 32 = longest kept
		expect(new DbConnectError('CONNECT_FAILED', 'x'.repeat(32)).code).to.equal('x'.repeat(32))
	})

	it('drops anything that is not a short code', () => {
		for (const code of ['x'.repeat(33), '', 'password=hunter2', 'a b', 'a-b', 'ünï', 'ok\nline']) {
			expect(new DbConnectError('CONNECT_FAILED', code).code, JSON.stringify(code)).to.equal(undefined)
		}
	})
})
