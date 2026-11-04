import { assertAffected } from '@lib/PostgreSQL/guard/assertAffected.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { AppError } from '../../../helpers/appErrors.mjs'

// run fn, hand back what it threw (undefined when nothing)
function thrown(action: () => void): unknown {
	try {
		action()
	} catch (error) {
		return error
	}
	return undefined
}

describe('assertAffected', () => {
	const mismatch = new AppError('STALE_VERSION')

	it('passes when the count is the expected one, for zero, one and many rows', () => {
		expect(thrown(() => assertAffected({ rowCount: 0 }, 0, mismatch))).to.equal(undefined)
		expect(thrown(() => assertAffected({ rowCount: 1 }, 1, mismatch))).to.equal(undefined)
		expect(thrown(() => assertAffected({ rowCount: 7 }, 7, mismatch))).to.equal(undefined)
	})

	it('answers nothing, not even the count', () => {
		expect(assertAffected({ rowCount: 1 }, 1, mismatch)).to.equal(undefined)
	})

	it('throws the given error, the same object, when no row was affected', () => {
		expect(thrown(() => assertAffected({ rowCount: 0 }, 1, mismatch))).to.equal(mismatch)
	})

	it('throws the given error when many rows were affected and one was expected', () => {
		expect(thrown(() => assertAffected({ rowCount: 2 }, 1, mismatch))).to.equal(mismatch)
		expect(thrown(() => assertAffected({ rowCount: 1000 }, 1, mismatch))).to.equal(mismatch)
	})

	it('throws when one row was affected and zero or many were expected', () => {
		expect(thrown(() => assertAffected({ rowCount: 1 }, 0, mismatch))).to.equal(mismatch)
		expect(thrown(() => assertAffected({ rowCount: 1 }, 3, mismatch))).to.equal(mismatch)
	})

	it('does not take a count the server did not report for a success', () => {
		expect(thrown(() => assertAffected({ rowCount: null }, 0, mismatch))).to.equal(mismatch)
		expect(thrown(() => assertAffected({ rowCount: null }, 1, mismatch))).to.equal(mismatch)
	})

	it('accepts a function that builds the error, and calls it only on a mismatch', () => {
		const build = sinon.stub<[], Error>().callsFake(() => new AppError('NOT_FOUND', { entity: 'membership' }))
		assertAffected({ rowCount: 1 }, 1, build)
		expect(build.callCount).to.equal(0)
		const error = thrown(() => assertAffected({ rowCount: 0 }, 1, build))
		expect(build.callCount).to.equal(1)
		expect(error).to.be.instanceOf(AppError)
		expect(error).to.deep.include({ code: 'NOT_FOUND', details: { entity: 'membership' } })
	})

	it('throws a plain Error too: nothing ties it to the application family', () => {
		const plain = new Error('plain')
		expect(thrown(() => assertAffected({ rowCount: 0 }, 1, plain))).to.equal(plain)
	})

	describe('an expected count that is not a whole number from 0', () => {
		for (const expected of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
			it(`is a TypeError, thrown before the count is read (${String(expected)})`, () => {
				// getter counts reads → 0 reads proves the check ran first
				let reads = 0
				const result = {
					get rowCount(): number {
						reads += 1
						return 1
					}
				}
				const failure = thrown(() => assertAffected(result, expected, mismatch))
				expect(failure).to.be.instanceOf(TypeError)
				expect((failure as TypeError).message).to.equal('expected must be a whole number of rows from 0')
				expect(reads).to.equal(0)
			})
		}

		it('accepts 0 and the largest safe integer', () => {
			expect(thrown(() => assertAffected({ rowCount: 0 }, 0, mismatch))).to.equal(undefined)
			expect(thrown(() => assertAffected({ rowCount: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER, mismatch))).to.equal(
				undefined
			)
		})
	})
})
