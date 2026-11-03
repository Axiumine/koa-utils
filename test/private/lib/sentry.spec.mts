/**
 * sentry facade → SDK installed here, so exports must be the real SDK calls: events reach the real client.
 *
 * Probe = real `Sentry.init` + `beforeSend` recorder (sentryProbe), same instance the facade loaded (1 ESM cache).
 */
import { captureException, captureMessage, withScope } from '@private/lib/sentry.mjs'
import * as Sentry from '@sentry/node'
import { expect } from 'chai'
import { probeSentry } from '../../helpers/sentryProbe.mjs'

describe('private/lib/sentry', () => {
	it('exports the very functions of @sentry/node', () => {
		expect(captureException).to.equal(Sentry.captureException)
		expect(captureMessage).to.equal(Sentry.captureMessage)
		expect(withScope).to.equal(Sentry.withScope)
	})

	it('captureException reaches the client', async () => {
		const events = await probeSentry(() => {
			captureException(new Error('facade boom'))
			return Promise.resolve()
		})
		expect(events.map((e) => e.exceptionMessage)).to.deep.equal(['facade boom'])
	})

	it('captureMessage reaches the client with its level', async () => {
		const events = await probeSentry(() => {
			captureMessage('facade msg', 'warning')
			return Promise.resolve()
		})
		expect(events.map((e) => [e.message, e.level])).to.deep.equal([['facade msg', 'warning']])
	})

	it('withScope: level set in the callback applies to the capture inside it', async () => {
		const events = await probeSentry(() => {
			withScope((scope) => {
				scope.setLevel('fatal')
				captureMessage('inside scope')
			})
			return Promise.resolve()
		})
		expect(events.map((e) => [e.message, e.level])).to.deep.equal([['inside scope', 'fatal']])
	})
})
