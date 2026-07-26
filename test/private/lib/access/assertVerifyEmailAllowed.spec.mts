/**
 * Tests for private/lib/access/assertVerifyEmailAllowed.mts
 *
 * Pin the ORDER and ARGUMENTS of the email-verification guard chain — the part that
 * lived inline in routerVerifyEmail, unreachable by any test. Each handleIf* guard was
 * already unit-tested; missing was proof the chain call them, with the account's real
 * values, before granting access.
 *
 * Mutation testing found 6 ways to break this with the suite green. Every test below
 * = 1 of them.
 */
import {
	assertVerifyEmailAllowed,
	createAssertVerifyEmailAllowed
} from '../../../../dist/private/lib/access/assertVerifyEmailAllowed.mjs'
import { DEFAULT_VERIFY_EMAIL_PATHS } from '@lib/access/accessPaths.mjs'
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
	// Guards send mail + touch the DB on their rejection paths. Stub both, else each
	// rejecting test wait on a real SocketLabs call until it times out.
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
		// Mutation: handleIfAccountDisabled call deleted outright.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser({ disabled: true }), EMAIL, GOOD_HASH))
	})

	it('rejects a DELETED account, and passes the flag un-negated', async () => {
		// Mutation: handleIfAccountDeleted(email, !deleted). Negation block healthy accounts,
		// let deleted ones through → both directions asserted.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser({ deleted: true }), EMAIL, GOOD_HASH))

		const uId = await assertVerifyEmailAllowed(makeUser({ deleted: false }), EMAIL, GOOD_HASH)
		expect(uId, 'a non-deleted account must not be blocked').to.exist
	})

	it('compares the supplied hash against the STORED hash, not against itself', async () => {
		// Mutation: dbHash: hash instead of dbHash: userAccountEmail.hash → comparison
		// trivially true → ANY hash in the URL validate the account.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser(), EMAIL, 'attacker-supplied-hash'))
	})

	it('halts the chain on a bad hash — the guard must be awaited', async () => {
		// Mutation: the `await` dropped → rejection detached from the caller → execution fall
		// through the remaining guards on to enableEmailAccess. A floating rejection would
		// let this resolve instead of throw.
		await expectRejects(() => assertVerifyEmailAllowed(makeUser(), EMAIL, 'wrong-hash'))
	})

	it('forwards the account real requestTimes to the throttle guard', async () => {
		// Mutation: handleIfTooMuchRequestsTimes(email, 0) — hard-coded 0 report "no prior
		// attempts" every time → >= 5 lockout permanently disabled.
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

	it('runs the injected guards, in order, on the values it read from the document', async () => {
		// All 6 guards are deps now. Were 4 injected + 3 hard-imported, and each hard-imported
		// one built its own SocketLabs client → no caller reach those branches without mailing
		// for real. Also pin the order, which nothing else does: the already-valid check has to
		// precede the strike counter, and the account flags have to be read before anything is
		// granted.
		const calls: string[] = []
		const spy = (name: string) => sinon.stub().callsFake(async () => void calls.push(name))
		const guards = {
			handleIfEmailAlreadyValid: spy('alreadyValid'),
			handleIfHashBad: spy('hashBad'),
			handleIfMoreThan3DaysPassed: spy('tooOld'),
			handleIfTooMuchRequestsTimes: spy('tooMuch'),
			handleIfAccountDeleted: spy('deleted'),
			handleIfAccountDisabled: spy('disabled')
		}
		const chain = createAssertVerifyEmailAllowed({ paths: DEFAULT_VERIFY_EMAIL_PATHS, ...guards } as never)
		const user = makeUser()

		const uId = await chain(user, EMAIL, GOOD_HASH)

		expect(calls).to.deep.equal(['alreadyValid', 'tooMuch', 'hashBad', 'tooOld', 'deleted', 'disabled'])
		expect(guards.handleIfEmailAlreadyValid.firstCall.args).to.deep.equal([EMAIL, false])
		expect(guards.handleIfTooMuchRequestsTimes.firstCall.args).to.deep.equal([EMAIL, 1])
		expect(guards.handleIfHashBad.firstCall.args[0]).to.deep.include({ uEmail: EMAIL, hash: GOOD_HASH, dbHash: GOOD_HASH })
		expect(guards.handleIfAccountDeleted.firstCall.args).to.deep.equal([EMAIL, false])
		expect(guards.handleIfAccountDisabled.firstCall.args).to.deep.equal([EMAIL, false])
		expect(String(uId)).to.equal(String((user as unknown as { _id: Types.ObjectId })._id))
	})

	it('does not enable the account itself — that stays with the caller', async () => {
		// Mutation: enableEmailAccess moved ahead of the remaining guards → access granted
		// even when a later guard would still have thrown. Keeping the irreversible side
		// effect outside this fn makes that reordering impossible, not merely untested: all
		// this can do is return an id.
		const uId = await assertVerifyEmailAllowed(makeUser(), EMAIL, GOOD_HASH)
		expect(uId).to.be.instanceOf(Types.ObjectId)
	})
})
