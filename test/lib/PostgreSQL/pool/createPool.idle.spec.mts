import { createPool } from '@lib/PostgreSQL/pool/createPool.mjs'
import { expect } from 'chai'

import { fakeDriver, newWorld } from '../../../helpers/fakePgDriver.mjs'
import { baseOptions, ENCODED, PASSWORD, setup, URL_WITH_PASSWORD } from '../../../helpers/poolHarness.mjs'
import { recordingLogger } from '../../../helpers/recordingLogger.mjs'

describe('createPool: the error of an idle client', () => {
	it('is logged and counted, and the emit does not throw', () => {
		const { pool, log, counts } = setup()
		const failure = Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' })
		expect(() => pool.emit('error', failure)).to.not.throw()
		expect(counts).to.deep.equal(['db_pool_idle_client_errors_total'])
		expect(log.calls).to.deep.equal([
			{
				level: 'error',
				message: 'database pool idle client error',
				fields: { reason: 'IDLE_CLIENT_ERROR', errorCode: '57P01', detail: 'terminating connection due to administrator command' }
			}
		])
	})

	it('counts every event', () => {
		const { pool, counts } = setup()
		for (let i = 0; i < 3; i += 1) pool.emit('error', new Error('x'))
		expect(counts).to.deep.equal(Array<string>(3).fill('db_pool_idle_client_errors_total'))
	})

	it('removes the URL and the password from the message of the driver, in both spellings', () => {
		const { pool, log } = setup()
		pool.emit('error', new Error(`cannot reach ${URL_WITH_PASSWORD}: login with ${PASSWORD} / ${ENCODED} failed`))
		expect(log.calls).to.have.lengthOf(1)
		const text = JSON.stringify(log.calls)
		for (const secret of [PASSWORD, ENCODED, URL_WITH_PASSWORD]) expect(text).to.not.contain(secret)
		expect(log.calls[0]?.fields?.['detail']).to.equal('cannot reach [REDACTED]: login with [REDACTED] / [REDACTED] failed')
	})

	it('removes a password that is not valid percent-encoding in its raw form', () => {
		const world = newWorld()
		const log = recordingLogger()
		const url = 'postgres://app_role:100%zz@127.0.0.1:5432/app_test'
		const pool = createPool({ ...baseOptions(), driver: fakeDriver(world), url, logger: log.logger })
		pool.emit('error', new Error('login with 100%zz failed'))
		expect(log.calls[0]?.fields?.['detail']).to.equal('login with [REDACTED] failed')
	})

	it('removes the longest secret first: a password that contains another secret', () => {
		const world = newWorld()
		const log = recordingLogger()
		// url contains password; both are secrets. Shorter-first replace would leave a fragment of the url
		const url = 'postgres://app_role:secret@127.0.0.1:5432/app_test'
		const pool = createPool({ ...baseOptions(), driver: fakeDriver(world), url, logger: log.logger })
		pool.emit('error', new Error(`url ${url} password secret`))
		expect(log.calls[0]?.fields?.['detail']).to.equal('url [REDACTED] password [REDACTED]')
	})

	it('writes no error code when the error has none, and handles a value that is no Error', () => {
		const { pool, log } = setup()
		pool.emit('error', new Error('plain'))
		pool.emit('error', 'a string')
		pool.emit('error', null)
		expect(log.calls).to.have.lengthOf(3)
		for (const call of log.calls) expect(call.fields).to.not.have.property('errorCode')
		expect(log.calls[1]?.fields?.['detail']).to.equal('not an Error')
		expect(log.calls[2]?.fields?.['detail']).to.equal('not an Error')
	})

	it('works without a counter and with a URL that has no password', () => {
		const world = newWorld()
		const log = recordingLogger()
		const pool = createPool({
			...baseOptions(),
			driver: fakeDriver(world),
			url: 'postgres://app_role@127.0.0.1:5432/app_test',
			logger: log.logger
		})
		expect(() => pool.emit('error', new Error('x'))).to.not.throw()
		expect(log.calls[0]?.fields?.['detail']).to.equal('x')
	})

	it('is what keeps the process alive: a pool without the listener throws the event', () => {
		const { world } = setup()
		const bare = new (fakeDriver(world).Pool)({} as never)
		expect(() => bare.emit('error', new Error('unhandled'))).to.throw('unhandled')
	})
})
