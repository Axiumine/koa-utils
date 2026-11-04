import { DB_PARSE_REASONS } from '@lib/PostgreSQL/error/DB_PARSE_REASONS.mjs'
import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { expect } from 'chai'

describe('DbParseError', () => {
	it('DB_PARSE_REASONS holds the four closed reasons, in order', () => {
		expect([...DB_PARSE_REASONS]).to.deep.equal(['MALFORMED', 'OUT_OF_RANGE', 'TIME_HAS_SECONDS', 'UNSUPPORTED_TYPE'])
	})

	for (const reason of DB_PARSE_REASONS) {
		it(`carries the reason ${reason}, the type name and a fixed message`, () => {
			const error = new DbParseError(reason, 'date')
			expect(error).to.be.instanceOf(Error)
			expect(error.name).to.equal('DbParseError')
			expect(error.reason).to.equal(reason)
			expect(error.typeName).to.equal('date')
			expect(error.message).to.equal(`database value of type date cannot be read: ${reason}`)
			expect(error.cause).to.equal(undefined)
		})
	}

	it('is its own class: no shared base with the connect error', () => {
		// instanceof per class → callers tell the two apart
		expect(Object.getPrototypeOf(DbParseError.prototype)).to.equal(Error.prototype)
	})
})
