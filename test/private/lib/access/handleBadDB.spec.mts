/**
 * Tests for private/lib/access/handleBadDB.mts
 *
 * Chain: handleBadDB(requestTimes?, dateLastReq?)
 *          → if requestTimes === undefined OR dateLastReq === undefined:
 *              Sentry.captureMessage('[handleBadDB] DB ERROR', 'error') → throw Error('/x/error')
 *          → otherwise: resolves with no return value
 *
 * NOTE: Sentry.captureMessage is a non-configurable ESM live binding and cannot be
 * stubbed/spied on directly (see test/lib/tryCatchRethrow.spec.mts, test/dataSources/Redis.spec.mts).
 * Without Sentry.init() it is a no-op, so we assert the observable throw/no-throw behavior only.
 */
import { handleBadDB } from '@private/lib/access/handleBadDB.mjs'
import { expect } from 'chai'

// ---------------------------------------------------------------------------

describe('handleBadDB', () => {
	it('both requestTimes and dateLastReq undefined (no args) → throws /x/error', () => {
		let caught: unknown

		try {
			handleBadDB()
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal('/x/error')
	})

	it('requestTimes defined but dateLastReq undefined → throws /x/error', () => {
		let caught: unknown

		try {
			handleBadDB(3)
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal('/x/error')
	})

	it('requestTimes undefined but dateLastReq defined → throws /x/error', () => {
		let caught: unknown

		try {
			handleBadDB(undefined, new Date())
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal('/x/error')
	})

	it('requestTimes = 0 (falsy but defined) and dateLastReq defined → does not throw', () => {
		expect(() => handleBadDB(0, new Date())).to.not.throw()
	})

	it('both requestTimes and dateLastReq defined → resolves with no return value', () => {
		const result = handleBadDB(5, new Date())

		expect(result).to.equal(undefined)
	})
})
