/**
 * Mutation-testing guards for koa/tdwKoaErrorHandler.mts
 *
 * Pin: `dotenv.config()` at import, Sentry report only for non-GraphQL errors AND only in development.
 * Sentry observed with a real in-memory client (see helpers/sentryProbeS2.mts), not stubbed.
 */
import { tdwKoaErrorHandler } from '../../dist/koa/tdwKoaErrorHandler.mjs'
import { expect } from 'chai'
import { EventEmitter } from 'events'
import { GraphQLError } from 'graphql'
import path from 'path'

import { envLoadedByImport } from '../helpers/dotenvProbeS2.mjs'
import { restoreNodeEnv, saveNodeEnv } from '../helpers/nodeEnv.mjs'
import { ISentryProbe, startSentryProbe } from '../helpers/sentryProbeS2.mjs'

function makeCtx() {
	const app = new EventEmitter()
	app.on('error', () => undefined)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { status: 200, body: undefined, app } as any
}

describe('tdwKoaErrorHandler — mutation guards', () => {
	let probe: ISentryProbe
	let savedEnv: string | undefined

	beforeEach(async () => {
		savedEnv = saveNodeEnv()
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		restoreNodeEnv(savedEnv)
	})

	it('loads the env file at import time (dotenv.config)', async () => {
		const loaded = await envLoadedByImport(path.resolve('dist/koa/tdwKoaErrorHandler.mjs'))
		expect(loaded).to.equal('loaded')
	})

	it('development: a non-GraphQL error is reported to Sentry', async () => {
		process.env['NODE_ENV'] = 'development'

		await tdwKoaErrorHandler(makeCtx(), async () => {
			throw new Error('dev boom')
		})
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['dev boom'])
	})

	it('development: a GraphQL error is not reported to Sentry', async () => {
		process.env['NODE_ENV'] = 'development'

		await tdwKoaErrorHandler(makeCtx(), async () => {
			throw new GraphQLError('gql in dev')
		})
		await probe.flush()

		expect(probe.events).to.have.lengthOf(0)
	})

	for (const env of ['production', 'test', '', undefined]) {
		it(`NODE_ENV=${JSON.stringify(env)}: nothing is reported to Sentry`, async () => {
			if (typeof env === 'undefined') {
				delete process.env['NODE_ENV']
			} else {
				process.env['NODE_ENV'] = env
			}

			await tdwKoaErrorHandler(makeCtx(), async () => {
				throw new Error('quiet boom')
			})
			await probe.flush()

			expect(probe.events).to.have.lengthOf(0)
		})
	}
})
