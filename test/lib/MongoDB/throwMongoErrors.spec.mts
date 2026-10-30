import { throwMongoDBErrors } from '@lib/MongoDB/throwMongoErrors.mjs'
import { expect } from 'chai'

import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'
import { ISentryProbe, startSentryProbe } from '../../helpers/sentryProbeS2.mjs'

describe('throwMongoDBErrors', () => {
	it('delegates to throwIfMongoErr for DuplicateKey (409)', () => {
		expectGraphQLError(
			() => throwMongoDBErrors({ errorResponse: { code: 11000 }, message: 'dup' } as never),
			409,
			'Conflict'
		)
	})

	it('throws 500 Internal Server Error when error not recognized', () => {
		expectGraphQLError(
			() => throwMongoDBErrors({ message: 'random failure' } as never),
			500,
			'Internal Server Error',
			'Error reported to Dev Team.'
		)
	})
})

describe('throwMongoDBErrors — mutation guards', () => {
	let probe: ISentryProbe

	beforeEach(async () => {
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
	})

	it('reports an unrecognized error to Sentry before the 500', async () => {
		expect(() => throwMongoDBErrors({ message: 'random failure' } as never)).to.throw()
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['random failure'])
	})

	it('does not report a recognized duplicate-key error', async () => {
		expect(() => throwMongoDBErrors({ errorResponse: { code: 11000 }, message: 'dup' } as never)).to.throw()
		await probe.flush()

		expect(probe.events).to.have.lengthOf(0)
	})
})
