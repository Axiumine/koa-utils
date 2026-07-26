/**
 * Tests for private/lib/access/handleBadDB.mts
 *
 * Chain: handleBadDB(requestTimes?, dateLastReq?)
 *          → if requestTimes === undefined OR dateLastReq === undefined:
 *              Sentry.captureMessage('[handleBadDB] DB ERROR', 'error') → throw Error(EMAIL_CHECK_LINK)
 *          → otherwise: resolves with no return value
 *
 * The redirect target is EMAIL_CHECK_LINK, the same one an unknown address, a wrong hash and an expired
 * link get. It used to be '/x/error', which made this branch tell an unauthenticated caller that the
 * address exists — and on data predating the verification fields, every real account answered '/x/error'
 * while every unknown one answered EMAIL_CHECK_LINK. Asserting the shared target is what keeps the
 * responses indistinguishable; the distinction lives in Sentry.
 *
 * NOTE: Sentry.captureMessage is a non-configurable ESM live binding and cannot be
 * stubbed/spied on directly (see test/lib/tryCatchRethrow.spec.mts, test/dataSources/Redis.spec.mts).
 * Without Sentry.init() it is a no-op, so we assert the observable throw/no-throw behavior only.
 */
import { handleBadDB } from '@private/lib/access/handleBadDB.mjs'
import { EMAIL_CHECK_LINK } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'

// ---------------------------------------------------------------------------

describe('handleBadDB', () => {
	it('both requestTimes and dateLastReq undefined (no args) → throws EMAIL_CHECK_LINK', () => {
		let caught: unknown

		try {
			handleBadDB()
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
	})

	it('requestTimes defined but dateLastReq undefined → throws EMAIL_CHECK_LINK', () => {
		let caught: unknown

		try {
			handleBadDB(3)
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
	})

	it('requestTimes undefined but dateLastReq defined → throws EMAIL_CHECK_LINK', () => {
		let caught: unknown

		try {
			handleBadDB(undefined, new Date())
		} catch (e) {
			caught = e
		}

		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal(EMAIL_CHECK_LINK)
	})

	it('requestTimes = 0 (falsy but defined) and dateLastReq defined → does not throw', () => {
		expect(() => handleBadDB(0, new Date())).to.not.throw()
	})

	it('both requestTimes and dateLastReq defined → resolves with no return value', () => {
		const result = handleBadDB(5, new Date())

		expect(result).to.equal(undefined)
	})
})
