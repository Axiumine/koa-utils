/**
 * createSentryClient → real SDK passes through, null (SDK not installed) → no-ops.
 *
 * No-op scope must mimic real Scope enough for every callback shape in src: chainable setters, any method name,
 * not thenable (async callback returning scope must not hang).
 */
import type { ISentryClient } from '@private/lib/ISentryClient.mjs'
import { createSentryClient } from '@private/lib/createSentryClient.mjs'
import type { Scope } from '@sentry/node'
import { expect } from 'chai'
import sinon from 'sinon'

describe('createSentryClient', () => {
	it('returns the given SDK object itself', () => {
		const sdk: ISentryClient = { captureException: sinon.stub(), captureMessage: sinon.stub(), withScope: sinon.stub() }
		expect(createSentryClient(sdk)).to.equal(sdk)
	})

	describe('null (SDK not installed)', () => {
		const client = createSentryClient(null)

		it('captureException = no-op, event id is the empty string', () => {
			expect(client.captureException(new Error('x'))).to.equal('')
			expect(client.captureException(new Error('x'), { extra: { a: 1 } })).to.equal('')
		})

		it('captureMessage = no-op, event id is the empty string', () => {
			expect(client.captureMessage('m')).to.equal('')
			expect(client.captureMessage('m', 'warning')).to.equal('')
		})

		it('withScope runs the callback exactly once and returns its result', () => {
			const callback = sinon.stub().returns(42)
			expect(client.withScope(callback)).to.equal(42)
			expect(callback.calledOnce).to.equal(true)
		})

		it('withScope hands the callback a scope with chainable setters', () => {
			client.withScope((scope: Scope) => {
				expect(scope.setTag('file', 'a.jpg')).to.equal(scope)
				expect(scope.setContext('viruses', { count: 1 })).to.equal(scope)
				expect(scope.setLevel('warning')).to.equal(scope)
				expect(scope.setTag('a', 'b').setLevel('error')).to.equal(scope)
			})
		})

		it('scope answers any method name, not only the ones used today', () => {
			client.withScope((scope: Scope) => {
				expect((scope as unknown as Record<string, () => unknown>)['someFutureSetter']?.()).to.equal(scope)
			})
		})

		it('scope is not thenable: an async callback returning it settles', async () => {
			const scope = await client.withScope((s: Scope) => Promise.resolve(s))
			expect((scope as unknown as { then?: unknown }).then).to.equal(undefined)
			expect(scope.setTag('a', 'b')).to.equal(scope)
		})

		it('is the same object on every call (module-level constant)', () => {
			expect(createSentryClient(null)).to.equal(client)
		})
	})
})
