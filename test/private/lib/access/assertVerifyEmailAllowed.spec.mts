/**
 * Tests for private/lib/access/assertVerifyEmailAllowed.mts
 *
 * These pin the ORDER and ARGUMENTS of the email-verification guard chain — the part
 * that lived inline in routerVerifyEmail, where no test could reach it. Each individual
 * handleIf* guard already had thorough unit tests; what was missing was proof that the
 * chain calls them, with the account's real values, before granting access.
 *
 * Mutation testing found six ways to break this while the whole suite stayed green.
 * Every test below corresponds to one of them.
 */
import { assertVerifyEmailAllowed } from '../../../../dist/private/lib/access/assertVerifyEmailAllowed.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

const EMAIL = 'user@test.com'
const GOOD_HASH = 'the-stored-hash'

function makeUser(overrides: Record<string, unknown> = {}) {
	const { emailOverrides, ...accountOverrides } = overrides as {
		emailOverrides?: Record<string, unknown>
	} & Record<string, unknown>
	return {
		_id: new Types.ObjectId(),
		account: {
			email: {
				hash: GOOD_HASH,
				valid: false,
				dateLastReq: new Date(),
				requestTimes: 1,
				...emailOverrides
			},
			deleted: false,
			disabled: false,
			...accountOverrides
		}
	} as never
}

async function expectRejects(fn: () => Promise<unknown>) {
	let caught: unknown
	try {
		await fn()
	} catch (e) {
		caught = e
	}
	expect(caught, 'the guard chain must reject').to.exist
	return caught
}

describe('assertVerifyEmailAllowed', () => {
	// The guards send mail and touch the DB on their rejection paths. Stub both, or each
	// rejecting test waits on a real SocketLabs call until it times out.
	beforeEach(() => {
		for (const m of [
			'wrongHash',
			'tooMuchVerifyRequests',
			'hashReqTooOld',
			'emailAlreadyValid',
			'accountDisabled',
			'accountDeleted'
		]) {
			const proto = SocketLabsLib.prototype as unknown as Record<string, unknown>
			if (typeof proto[m] === 'function') {
				sinon.stub(SocketLabsLib.prototype as never, m as never).resolves()
			}
		}
		sinon.stub(UserBase, 'updateOne').resolves({ modifiedCount: 1 } as never)
		sinon.stub(UserBase, 'deleteOne').resolves({ deletedCount: 1 } as never)
	})

	afterEach(() => {
		sinon.restore()
	})

	it('returns the user id when every guard passes', async () => {
		const user = makeUser()
		const uId = await assertVerifyEmailAllowed(user, EMAIL, GOOD_HASH)
		expect(String(uId)).to.equal(String((user as unknown as { _id: Types.ObjectId })._id))
	})

	it('rejects a DISABLED account', async () => {
		// Mutation: the handleIfAccountDisabled call was deleted outright.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser({ disabled: true }), EMAIL, GOOD_HASH))
	})

	it('rejects a DELETED account, and passes the flag un-negated', async () => {
		// Mutation: handleIfAccountDeleted(email, !deleted). Negation blocks healthy
		// accounts and lets deleted ones through, so both directions are asserted.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser({ deleted: true }), EMAIL, GOOD_HASH))

		const uId = await assertVerifyEmailAllowed(makeUser({ deleted: false }), EMAIL, GOOD_HASH)
		expect(uId, 'a non-deleted account must not be blocked').to.exist
	})

	it('compares the supplied hash against the STORED hash, not against itself', async () => {
		// Mutation: dbHash: hash instead of dbHash: userAccountEmail.hash, which makes
		// the comparison trivially true so ANY hash in the URL validates the account.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser(), EMAIL, 'attacker-supplied-hash'))
	})

	it('halts the chain on a bad hash — the guard must be awaited', async () => {
		// Mutation: the `await` was dropped, detaching the rejection from the caller so
		// execution fell through the remaining guards and on to enableEmailAccess.
		// A floating rejection would let this resolve instead of throwing.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser(), EMAIL, 'wrong-hash'))
	})

	it('forwards the account real requestTimes to the throttle guard', async () => {
		// Mutation: handleIfTooMuchRequestsTimes(email, 0) — hard-coding 0 reports "no
		// prior attempts" every time and permanently disables the >= 5 lockout.
		await expectRejects(() =>
			assertVerifyEmailAllowed(makeUser({ emailOverrides: { requestTimes: 5 } }), EMAIL, GOOD_HASH)
		)
	})

	it('rejects an already-valid email', async () => {
		await expectRejects(() =>
			assertVerifyEmailAllowed(makeUser({ emailOverrides: { valid: true } }), EMAIL, GOOD_HASH)
		)
	})

	it('rejects a link older than the 3-day window', async () => {
		const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
		await expectRejects(() =>
			assertVerifyEmailAllowed(makeUser({ emailOverrides: { dateLastReq: old } }), EMAIL, GOOD_HASH)
		)
	})

	it('does not enable the account itself — that stays with the caller', async () => {
		// Mutation: enableEmailAccess was moved ahead of the remaining guards, granting
		// access even when a later guard would still have thrown. Keeping the
		// irreversible side effect outside this function makes that reordering
		// impossible rather than merely untested: all this can do is return an id.
		const uId = await assertVerifyEmailAllowed(makeUser(), EMAIL, GOOD_HASH)
		expect(uId).to.be.instanceOf(Types.ObjectId)
	})
})
