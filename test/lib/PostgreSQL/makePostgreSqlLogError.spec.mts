import { IPostgresErrorCodes } from '@lib/PostgreSQL/IPostgresErrorCodes.mjs'
import { makePostgreSqlLogError } from '@lib/PostgreSQL/makePostgreSqlLogError.mjs'
import { expect } from 'chai'

describe('PostgreSQL helpers', () => {
	describe('IPostgresErrorCodes', () => {
		it('duplicateKeyValue = 23505', () => {
			expect(IPostgresErrorCodes.duplicateKeyValue).to.equal('23505')
		})
	})

	describe('makePostgreSqlLogError', () => {
		it('joins code | hint | detail | constraint with " | "', () => {
			const err = Object.assign(new Error('x'), {
				code: '23505',
				hint: 'h',
				detail: 'd',
				constraint: 'uq_email'
			})
			expect(makePostgreSqlLogError(err)).to.equal('23505 | h | d | uq_email')
		})

		it('emits undefined for missing fields', () => {
			const err = new Error('x') as Error & Record<string, unknown>
			expect(makePostgreSqlLogError(err)).to.equal('undefined | undefined | undefined | undefined')
		})
	})
})
