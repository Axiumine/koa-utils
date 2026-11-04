import { DB_INTERNAL_REASONS } from '@lib/PostgreSQL/error/DB_INTERNAL_REASONS.mjs'
import { expect } from 'chai'

describe('DB_INTERNAL_REASONS', () => {
	it('lists every reason that mapDbError and guardVersion build, once', () => {
		expect([...DB_INTERNAL_REASONS].sort()).to.deep.equal(
			[
				'CONSTRAINT_INTERNAL',
				'CONSTRAINT_UNMAPPED',
				'DB_CONNECTION',
				'DB_ERROR',
				'DB_TX_MISUSE',
				'DB_VALUE_UNREADABLE',
				'DETAILS_NOT_SUPPLIED',
				'REREAD_UNREADABLE',
				'UNEXPECTED_ERROR',
				'VERSION_UNCHANGED'
			].sort()
		)
		expect(new Set(DB_INTERNAL_REASONS).size).to.equal(DB_INTERNAL_REASONS.length)
	})

	it('keeps the order of the documentation: constraint reasons first, guard reasons last', () => {
		expect(DB_INTERNAL_REASONS[0]).to.equal('CONSTRAINT_UNMAPPED')
		expect(DB_INTERNAL_REASONS.at(-1)).to.equal('REREAD_UNREADABLE')
	})
})
