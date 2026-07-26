/**
 * Tests for lib/access/verifyEmailMailer.mts
 *
 * 3 things pinned:
 * - socketLabsVerifyEmailMailer forward each of the 6 methods to the matching SocketLabs
 * template, args untouched. Wrong mapping → wrong copy from every guard at once.
 * - throttleMailer debounce per template AND per address, pass the delivery result through.
 * - sendWelcome never debounced: fire once per account, on the one path already requiring
 * a valid hash → suppress it = a real user lose their welcome mail.
 */
import { ALWAYS_MAIL, createMailThrottle } from '@lib/access/createMailThrottle.mjs'
import {
	defaultVerifyEmailMailer,
	IVerifyEmailMailer,
	socketLabsVerifyEmailMailer,
	throttleMailer
} from '@lib/access/verifyEmailMailer.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { fakeVerifyEmailMailer, IFakeVerifyEmailMailer } from '../../helpers/fakeVerifyEmailMailer.mjs'

// ---------------------------------------------------------------------------

describe('socketLabsVerifyEmailMailer', () => {
	afterEach(() => sinon.restore())

	it('forwards every method to the SocketLabs template of the same name', async () => {
		const stubs = {
			emailAlreadyValid: sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves(),
			wrongHash: sinon.stub(SocketLabsLib.prototype, 'wrongHash').resolves(),
			tooMuchVerifyRequests: sinon.stub(SocketLabsLib.prototype, 'tooMuchVerifyRequests').resolves(),
			hashReqTooOld: sinon.stub(SocketLabsLib.prototype, 'hashReqTooOld').resolves(),
			accountDisabled: sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves(),
			sendWelcome: sinon.stub(SocketLabsLib.prototype, 'sendWelcome').resolves()
		}

		await socketLabsVerifyEmailMailer.emailAlreadyValid('a@test.com')
		await socketLabsVerifyEmailMailer.wrongHash('b@test.com', 3)
		await socketLabsVerifyEmailMailer.tooMuchVerifyRequests('c@test.com')
		await socketLabsVerifyEmailMailer.hashReqTooOld('d@test.com')
		await socketLabsVerifyEmailMailer.accountDisabled('e@test.com')
		await socketLabsVerifyEmailMailer.sendWelcome('f@test.com')

		expect(stubs.emailAlreadyValid.calledOnceWithExactly('a@test.com')).to.equal(true)
		expect(stubs.wrongHash.calledOnceWithExactly('b@test.com', 3)).to.equal(true)
		expect(stubs.tooMuchVerifyRequests.calledOnceWithExactly('c@test.com')).to.equal(true)
		expect(stubs.hashReqTooOld.calledOnceWithExactly('d@test.com')).to.equal(true)
		expect(stubs.accountDisabled.calledOnceWithExactly('e@test.com')).to.equal(true)
		expect(stubs.sendWelcome.calledOnceWithExactly('f@test.com')).to.equal(true)
	})

	it('returns what the SocketLabs client returns', async () => {
		sinon.stub(SocketLabsLib.prototype, 'sendWelcome').resolves(true as never)

		expect(await socketLabsVerifyEmailMailer.sendWelcome('f@test.com')).to.equal(true)
	})
})

describe('throttleMailer', () => {
	let inner: IFakeVerifyEmailMailer
	let clock: sinon.SinonFakeTimers

	beforeEach(() => {
		inner = fakeVerifyEmailMailer()
		clock = sinon.useFakeTimers()
	})

	afterEach(() => {
		clock.restore()
		sinon.restore()
	})

	it('sends the first mail of each kind and drops repeats inside the window', async () => {
		const mailer = throttleMailer(inner, createMailThrottle({ windowMs: 1000 }))

		await mailer.emailAlreadyValid('user@test.com')
		await mailer.emailAlreadyValid('user@test.com')

		expect(inner.emailAlreadyValid.calledOnce).to.equal(true)

		clock.tick(1000)
		await mailer.emailAlreadyValid('user@test.com')
		expect(inner.emailAlreadyValid.calledTwice).to.equal(true)
	})

	it('debounces per template and per address, not globally', async () => {
		const mailer = throttleMailer(inner, createMailThrottle({ windowMs: 1000 }))

		await mailer.emailAlreadyValid('a@test.com')
		await mailer.emailAlreadyValid('b@test.com')
		await mailer.accountDisabled('a@test.com')
		await mailer.wrongHash('a@test.com', 1)
		await mailer.tooMuchVerifyRequests('a@test.com')
		await mailer.hashReqTooOld('a@test.com')

		expect(inner.emailAlreadyValid.calledTwice).to.equal(true)
		expect(inner.accountDisabled.calledOnce).to.equal(true)
		expect(inner.wrongHash.calledOnceWithExactly('a@test.com', 1)).to.equal(true)
		expect(inner.tooMuchVerifyRequests.calledOnce).to.equal(true)
		expect(inner.hashReqTooOld.calledOnce).to.equal(true)
	})

	it('every debounced kind drops its repeat', async () => {
		const mailer = throttleMailer(inner, createMailThrottle({ windowMs: 1000 }))

		for (let i = 0; i < 2; i++) {
			await mailer.emailAlreadyValid('a@test.com')
			await mailer.wrongHash('a@test.com', i)
			await mailer.tooMuchVerifyRequests('a@test.com')
			await mailer.hashReqTooOld('a@test.com')
			await mailer.accountDisabled('a@test.com')
		}

		expect(inner.emailAlreadyValid.callCount).to.equal(1)
		expect(inner.wrongHash.callCount).to.equal(1)
		expect(inner.tooMuchVerifyRequests.callCount).to.equal(1)
		expect(inner.hashReqTooOld.callCount).to.equal(1)
		expect(inner.accountDisabled.callCount).to.equal(1)
	})

	it('never debounces sendWelcome', async () => {
		const mailer = throttleMailer(inner, createMailThrottle({ windowMs: 1000 }))

		await mailer.sendWelcome('user@test.com')
		await mailer.sendWelcome('user@test.com')

		expect(inner.sendWelcome.calledTwice).to.equal(true)
	})

	it('passes the delivery result through, and resolves undefined when suppressed', async () => {
		inner.emailAlreadyValid.resolves('sent')
		const mailer = throttleMailer(inner, createMailThrottle({ windowMs: 1000 }))

		expect(await mailer.emailAlreadyValid('user@test.com')).to.equal('sent')
		expect(await mailer.emailAlreadyValid('user@test.com')).to.equal(undefined)
	})

	it('accepts an async throttle, such as a Redis-backed one', async () => {
		const seen: string[] = []
		const asyncThrottle = async (key: string) => {
			seen.push(key)
			return seen.length === 1
		}
		const mailer = throttleMailer(inner, asyncThrottle)

		await mailer.accountDisabled('user@test.com')
		await mailer.accountDisabled('user@test.com')

		expect(seen).to.deep.equal(['accountDisabled:user@test.com', 'accountDisabled:user@test.com'])
		expect(inner.accountDisabled.calledOnce).to.equal(true)
	})

	it('ALWAYS_MAIL restores send-every-time', async () => {
		const mailer = throttleMailer(inner, ALWAYS_MAIL)

		await mailer.emailAlreadyValid('user@test.com')
		await mailer.emailAlreadyValid('user@test.com')

		expect(inner.emailAlreadyValid.calledTwice).to.equal(true)
	})
})

describe('defaultVerifyEmailMailer', () => {
	afterEach(() => sinon.restore())

	it('is debounced: a second identical send in the same window never reaches SocketLabs', async () => {
		const stub = sinon.stub(SocketLabsLib.prototype, 'emailAlreadyValid').resolves()
		// Address used by this test only. Default binding is module-level → window shared by
		// every spec in the run — why guard specs inject their own mailer instead.
		const email = 'default-mailer-probe@test.com'
		const mailer: IVerifyEmailMailer = defaultVerifyEmailMailer

		await mailer.emailAlreadyValid(email)
		await mailer.emailAlreadyValid(email)

		expect(stub.calledOnceWithExactly(email)).to.equal(true)
	})
})
