/**
 * Spec private/email/orFalse.mts
 *
 * resolve → value pass through. reject / sync throw → Sentry once + false.
 */
import { orFalse } from '@private/email/orFalse.mjs'
import * as Sentry from '@sentry/node'
import { expect } from 'chai'
import sinon from 'sinon'

describe('orFalse', () => {
	let captureStub: sinon.SinonStub

	beforeEach(() => {
		// Namespace sealed, scope object not → stub scope delegate (same trick as SocketLabsLib spec).
		captureStub = sinon.stub(Sentry.getCurrentScope(), 'captureException')
	})

	afterEach(() => sinon.restore())

	it('returns true and reports nothing when the send resolves true', async () => {
		expect(await orFalse(() => Promise.resolve(true))).to.equal(true)
		expect(captureStub.called).to.equal(false)
	})

	it('passes a resolved false through without reporting', async () => {
		expect(await orFalse(() => Promise.resolve(false))).to.equal(false)
		expect(captureStub.called).to.equal(false)
	})

	it('returns false and reports the error once when the send rejects', async () => {
		const err = new Error('rejected')
		expect(await orFalse(() => Promise.reject(err))).to.equal(false)
		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
	})

	it('returns false and reports the error once when the send throws synchronously', async () => {
		const err = new Error('thrown')
		const send = (): Promise<boolean> => {
			throw err
		}
		expect(await orFalse(send)).to.equal(false)
		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
	})
})
