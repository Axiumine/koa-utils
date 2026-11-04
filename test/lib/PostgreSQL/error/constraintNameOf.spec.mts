import { constraintNameOf } from '@lib/PostgreSQL/error/constraintNameOf.mjs'
import { expect } from 'chai'

describe('constraintNameOf', () => {
	it('answers a plain identifier of at most 63 characters', () => {
		expect(constraintNameOf({ constraint: 'users_email_uq' })).to.equal('users_email_uq')
		expect(constraintNameOf({ constraint: 'a$b_9' })).to.equal('a$b_9')
		expect(constraintNameOf({ constraint: 'a' })).to.equal('a')
		expect(constraintNameOf({ constraint: 'a'.repeat(63) })).to.equal('a'.repeat(63))
	})

	it('answers undefined for a name that is not a plain identifier, and for non-errors', () => {
		const refused: unknown[] = [
			undefined,
			null,
			'text',
			{},
			{ constraint: 7 },
			{ constraint: '' },
			{ constraint: 'a'.repeat(64) },
			{ constraint: 'two words' },
			{ constraint: 'quoted"name' },
			{ constraint: 'new\nline' },
			{ constraint: 'Key (email)=(a@b.c)' },
			// anchors
			{ constraint: ' ok' },
			{ constraint: 'ok ' }
		]
		for (const value of refused) expect(constraintNameOf(value), JSON.stringify(value)).to.equal(undefined)
	})
})
