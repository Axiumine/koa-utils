/**
 * Mutation-testing guards for koa/middleware/authenticatedResourceHandler/index.mts
 *
 * Pin: `dotenv.config()` at import, Redis lookup key = REDIS_KEY prefix + the bearer `access:<uuid>`.
 */
import { authenticatedResourceHandler } from '../../../dist/koa/middleware/authenticatedResourceHandler/index.mjs'
import { expect } from 'chai'
import path from 'path'
import sinon from 'sinon'
import * as RedisMod from '../../../dist/dataSources/Redis.mjs'

import { envLoadedByImport } from '../../helpers/dotenvProbeS2.mjs'

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('authenticatedResourceHandler — mutation guards', () => {
	let savedRedisKey: string | undefined

	beforeEach(() => {
		savedRedisKey = process.env['REDIS_KEY']
	})

	afterEach(() => {
		sinon.restore()
		// undefined assigned to process.env become literal 'undefined' string → delete instead
		if (typeof savedRedisKey === 'undefined') {
			delete process.env['REDIS_KEY']
		} else {
			process.env['REDIS_KEY'] = savedRedisKey
		}
	})

	it('loads the env file at import time (dotenv.config)', async () => {
		const loaded = await envLoadedByImport(path.resolve('dist/koa/middleware/authenticatedResourceHandler/index.mjs'))
		expect(loaded).to.equal('loaded')
	})

	it('reads the session under REDIS_KEY prefix + the exact access key', async () => {
		process.env['REDIS_KEY'] = 'pfx:'
		const hGetAll = sinon.stub(RedisMod.redisClient, 'hGetAll').resolves({ id: '507f1f77bcf86cd799439011' })
		const ctx = {
			request: { header: { authorization: `Bearer access:${VALID_UUID}` } },
			state: {}
		} as never

		await authenticatedResourceHandler()(ctx, async () => undefined)

		expect(hGetAll.calledOnceWithExactly(`pfx:access:${VALID_UUID}`)).to.equal(true)
	})
})
