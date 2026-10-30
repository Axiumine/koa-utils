/**
 * Mutation-testing guards for graphQL/schema/mutations/logout.mts
 *
 * Pin: `dotenv.config()` at import, exact Redis key (env prefix + namespace), catch → Sentry + still true.
 */
import { logout } from '../../../../dist/graphQL/schema/mutations/logout.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { expect } from 'chai'
import path from 'path'
import sinon from 'sinon'

import { envLoadedByImport } from '../../../helpers/dotenvProbeS2.mjs'
import { ISentryProbe, startSentryProbe } from '../../../helpers/sentryProbeS2.mjs'

function makeCtx(refreshToken: string, accessToken?: string) {
	return {
		state: { user: { refreshToken, accessToken } },
		cookies: { set: sinon.stub() }
	} as never
}

describe('logout — mutation guards', () => {
	let delStub: sinon.SinonStub
	let probe: ISentryProbe
	let savedRedisKey: string | undefined

	beforeEach(async () => {
		savedRedisKey = process.env['REDIS_KEY']
		process.env['REDIS_KEY'] = 'pfx:'
		delStub = sinon.stub(redisClient, 'del').resolves(1)
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		sinon.restore()
		// undefined assigned to process.env become literal 'undefined' string → delete instead
		if (typeof savedRedisKey === 'undefined') {
			delete process.env['REDIS_KEY']
		} else {
			process.env['REDIS_KEY'] = savedRedisKey
		}
	})

	it('loads .env at import time (dotenv.config)', async () => {
		const loaded = await envLoadedByImport(path.resolve('dist/graphQL/schema/mutations/logout.mjs'))
		expect(loaded).to.equal('loaded')
	})

	it('deletes refresh + access sessions under REDIS_KEY prefix, exact keys', async () => {
		await logout.resolve(null, {}, makeCtx('refresh:rrr', 'access:aaa'))

		expect(delStub.getCalls().map((c) => c.args[0])).to.deep.equal(['pfx:refresh:rrr', 'pfx:access:aaa'])
	})

	it('prefixes bare tokens with their namespace', async () => {
		await logout.resolve(null, {}, makeCtx('rrr', 'aaa'))

		expect(delStub.getCalls().map((c) => c.args[0])).to.deep.equal(['pfx:refresh:rrr', 'pfx:access:aaa'])
	})

	it('Redis failure: still resolves true, reports the error to Sentry, skips the cookie', async () => {
		delStub.rejects(new Error('redis down'))
		const ctx = makeCtx('refresh:rrr', 'access:aaa')

		const result = await logout.resolve(null, {}, ctx)
		await probe.flush()

		expect(result).to.equal(true)
		expect(probe.texts()).to.deep.equal(['redis down'])
		expect((ctx as { cookies: { set: sinon.SinonStub } }).cookies.set.called).to.equal(false)
	})
})
