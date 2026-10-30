/**
 * Mutation-testing guards for graphQL/schema/mutations/refresh.mts
 *
 * Pin: `dotenv.config()` at import, exact Redis keys (env prefix), refresh record payload, rollback
 * deletes BOTH new keys, error reported to Sentry.
 */
import { refresh } from '../../../../dist/graphQL/schema/mutations/refresh.mjs'
import { redisClient } from '@dataSources/Redis.mjs'
import { expect } from 'chai'
import path from 'path'
import sinon from 'sinon'
import { GraphQLError } from 'graphql'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'
import { envLoadedByImport } from '../../../helpers/dotenvProbeS2.mjs'
import { ISentryProbe, startSentryProbe } from '../../../helpers/sentryProbeS2.mjs'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

function makeCtx(userId: Types.ObjectId, refreshToken = 'refresh:oldToken') {
	return {
		state: { user: { id: userId, refreshToken, role: 'user' } },
		cookies: { set: sinon.stub() }
	} as never
}

describe('refresh — mutation guards', () => {
	let hSetStub: sinon.SinonStub
	let expireStub: sinon.SinonStub
	let delStub: sinon.SinonStub
	let probe: ISentryProbe
	let savedRedisKey: string | undefined

	beforeEach(async () => {
		savedRedisKey = process.env['REDIS_KEY']
		process.env['REDIS_KEY'] = 'pfx:'
		hSetStub = sinon.stub(redisClient, 'hSet').resolves(0)
		expireStub = sinon.stub(redisClient, 'expire').resolves(1)
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
		const loaded = await envLoadedByImport(path.resolve('dist/graphQL/schema/mutations/refresh.mjs'))
		expect(loaded).to.equal('loaded')
	})

	it('writes new session records under REDIS_KEY prefix and deletes the rotated-out key', async () => {
		const userId = new Types.ObjectId()

		const result = (await refresh.resolve(null, {}, makeCtx(userId))) as { status: boolean; accessToken: string }

		const keyAccess = hSetStub.firstCall.args[0] as string
		const keyRefresh = hSetStub.secondCall.args[0] as string
		expect(keyAccess).to.match(new RegExp(`^pfx:access:${UUID}$`, 'i'))
		expect(keyRefresh).to.match(new RegExp(`^pfx:refresh:${UUID}$`, 'i'))
		expect(keyAccess).to.equal(`pfx:access:${result.accessToken}`)
		expect(hSetStub.secondCall.args[1], 'refresh record carries only the user id').to.deep.equal({ id: userId.toString() })
		expect(expireStub.getCalls().map((c) => c.args[0])).to.deep.equal([keyAccess, keyRefresh])
		expect(delStub.getCalls().map((c) => c.args[0])).to.deep.equal(['pfx:refresh:oldToken'])
	})

	it('Redis failure: reports to Sentry once, rolls back BOTH new keys, rethrows with status 500', async () => {
		// GraphQLError → tryCatchRethrow does not report it → only the catch in refresh does. A plain Error
		// would be reported by both, and Sentry drop the 2nd capture of the same object → mutant invisible.
		hSetStub.rejects(new GraphQLError('Redis connection lost'))

		await expectGraphQLErrorAsync(
			() => refresh.resolve(null, {}, makeCtx(new Types.ObjectId())),
			500,
			'Redis connection lost'
		)
		await probe.flush()

		const keyAccess = hSetStub.firstCall.args[0] as string
		const keyRefresh = hSetStub.secondCall.args[0] as string
		expect(delStub.getCalls().map((c) => c.args[0])).to.have.members([keyAccess, keyRefresh]).and.to.have.lengthOf(2)
		expect(probe.texts()).to.deep.equal(['Redis connection lost'])
	})
})
