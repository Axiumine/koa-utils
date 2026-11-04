import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { createPool } from '@lib/PostgreSQL/pool/createPool.mjs'
import { expect } from 'chai'

import { fakeDriver, HANG, newWorld, NO_ROW } from '../../../helpers/fakePgDriver.mjs'
import { baseOptions, ENCODED, everythingAbout, PASSWORD, setup, URL_WITH_PASSWORD } from '../../../helpers/poolHarness.mjs'
import { recordingLogger } from '../../../helpers/recordingLogger.mjs'

const settled = (promise: Promise<unknown>): Promise<unknown> => promise.catch((error: unknown) => error)

describe('createPool: the session check and a connect that fails', () => {
	describe('the session check', () => {
		it('lets a UTC session through and asks one question', async () => {
			const { world, pool, counts, log } = setup()
			expect(await pool.checkout()).to.not.equal(undefined)
			expect(world.statements).to.deep.equal(['SHOW timezone'])
			expect(world.clients[0]?.ended).to.equal(0)
			expect(counts).to.deep.equal([])
			expect(log.calls).to.deep.equal([])
		})

		for (const timeZone of ['Asia/Tokyo', 'America/Los_Angeles', 'Etc/UTC', 'utc', '']) {
			it(`refuses a session in ${JSON.stringify(timeZone)} with TIMEZONE_NOT_UTC, ends the client, counts and logs`, async () => {
				const { world, pool, counts, log } = setup({ timeZone })
				const caught = await settled(pool.checkout())
				expect(caught).to.be.instanceOf(DbConnectError)
				expect((caught as DbConnectError).reason).to.equal('TIMEZONE_NOT_UTC')
				expect(world.clients[0]?.ended).to.equal(1)
				expect(counts).to.deep.equal(['db_pool_connect_failures_total'])
				expect(log.calls).to.deep.equal([{ level: 'warn', message: 'database connection refused', fields: { reason: 'TIMEZONE_NOT_UTC' } }])
			})
		}

		it('refuses an answer with no row', async () => {
			const { pool } = setup({ timeZone: NO_ROW })
			const caught = await settled(pool.checkout())
			expect((caught as DbConnectError).reason).to.equal('TIMEZONE_NOT_UTC')
		})

		it('turns a failed check query into CONNECT_FAILED with the code', async () => {
			const failure = Object.assign(new Error(`terminating connection for ${URL_WITH_PASSWORD}`), { code: '57P01' })
			const { pool, log } = setup({ timeZone: { error: failure } })
			const caught = await settled(pool.checkout())
			expect((caught as DbConnectError).reason).to.equal('CONNECT_FAILED')
			expect((caught as DbConnectError).code).to.equal('57P01')
			expect(log.calls[0]?.fields).to.deep.equal({ reason: 'CONNECT_FAILED', errorCode: '57P01' })
			const text = everythingAbout(caught, log.calls)
			expect(text).to.not.contain(PASSWORD)
			expect(text).to.not.contain(ENCODED)
		})
	})

	describe('a connect that fails', () => {
		it('turns the error of the driver into CONNECT_FAILED with its code and none of its text', async () => {
			const failure = Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:5432 for ${URL_WITH_PASSWORD} password ${PASSWORD}`), {
				code: 'ECONNREFUSED'
			})
			const { pool, log, counts, world } = setup({ connect: { error: failure } })
			const caught = await settled(pool.checkout())
			expect(caught).to.be.instanceOf(DbConnectError)
			expect((caught as DbConnectError).reason).to.equal('CONNECT_FAILED')
			expect((caught as DbConnectError).code).to.equal('ECONNREFUSED')
			expect((caught as DbConnectError).cause).to.equal(undefined)
			const text = everythingAbout(caught, log.calls)
			for (const secret of [PASSWORD, ENCODED, URL_WITH_PASSWORD, 'app_role:']) expect(text).to.not.contain(secret)
			expect(counts).to.deep.equal(['db_pool_connect_failures_total'])
			expect(world.clients[0]?.ended).to.equal(1)
			expect(log.calls).to.have.lengthOf(1)
			expect(log.calls[0]?.level).to.equal('warn')
			expect(log.calls[0]?.fields).to.deep.equal({ reason: 'CONNECT_FAILED', errorCode: 'ECONNREFUSED' })
		})

		it('turns a rejection that is no Error into CONNECT_FAILED without a code', async () => {
			const { pool, log } = setup({ connect: { error: `a string with ${PASSWORD}` } })
			const caught = await settled(pool.checkout())
			expect((caught as DbConnectError).reason).to.equal('CONNECT_FAILED')
			expect((caught as DbConnectError).code).to.equal(undefined)
			expect(everythingAbout(caught, log.calls)).to.not.contain(PASSWORD)
			expect(log.calls[0]?.fields).to.deep.equal({ reason: 'CONNECT_FAILED' })
		})

		it('drops a code that is not a short code', async () => {
			const failure = Object.assign(new Error('x'), { code: `bad code ${PASSWORD}` })
			const { pool, log } = setup({ connect: { error: failure } })
			const caught = await settled(pool.checkout())
			expect((caught as DbConnectError).code).to.equal(undefined)
			expect(everythingAbout(caught, log.calls)).to.not.contain(PASSWORD)
		})

		it('works without a counter', async () => {
			const world = newWorld({ connect: { error: new Error('x') } })
			const pool = createPool({ ...baseOptions(), driver: fakeDriver(world), max: 1 })
			expect(await settled(pool.checkout())).to.be.instanceOf(DbConnectError)
		})

		it('rejects with a DbConnectError when connect throws before it returns a promise', async () => {
			const world = newWorld()
			const driver = fakeDriver(world)
			class ThrowingClient extends (driver.Client as unknown as new (o: never) => { connect(): unknown }) {
				override connect(): never {
					throw new Error(`sync failure ${PASSWORD}`)
				}
			}
			const { logger, calls } = recordingLogger()
			const counts: string[] = []
			const pool = createPool({
				...baseOptions(),
				driver: { ...driver, Client: ThrowingClient },
				logger,
				counter: (name) => void counts.push(name),
				max: 1
			})
			const caught = await settled(pool.checkout())
			expect(caught).to.be.instanceOf(DbConnectError)
			expect((caught as DbConnectError).reason).to.equal('CONNECT_FAILED')
			// same bookkeeping as an async failure: counted, logged, client ended
			expect(counts).to.deep.equal(['db_pool_connect_failures_total'])
			expect(calls).to.have.lengthOf(1)
			expect(world.clients[0]?.ended).to.equal(1)
			expect(everythingAbout(caught, calls)).to.not.contain(PASSWORD)
		})
	})

	describe('end() of the failed client', () => {
		it('may reject: the checkout still gets the DbConnectError and nothing is left unhandled', async () => {
			const unhandled: unknown[] = []
			const onUnhandled = (reason: unknown): void => void unhandled.push(reason)
			process.on('unhandledRejection', onUnhandled)
			try {
				const { pool, world } = setup({ timeZone: 'Asia/Tokyo', end: 'reject' })
				const caught = await settled(pool.checkout())
				expect((caught as DbConnectError).reason).to.equal('TIMEZONE_NOT_UTC')
				// let a rejected end() surface as unhandled, if it were
				await new Promise((resolve) => setImmediate(resolve))
				expect(world.clients[0]?.ended).to.equal(1)
				expect(unhandled).to.deep.equal([])
			} finally {
				process.off('unhandledRejection', onUnhandled)
			}
		})

		it('is not awaited: the rejection does not wait for an end() that never settles', async () => {
			const { pool, world } = setup({ connect: { error: new Error('x') }, end: HANG })
			// would hang here (mocha timeout) if factory awaited end()
			expect(await settled(pool.checkout())).to.be.instanceOf(DbConnectError)
			expect(world.clients[0]?.ended).to.equal(1)
		})
	})

	describe('the callback form of connect, which pg-pool uses', () => {
		it('calls back with null when the session is ready', async () => {
			const { pool } = setup()
			const result = await new Promise<unknown>((resolve) => {
				pool.checkoutWithCallback((error) => {
					resolve(error)
				})
			})
			expect(result).to.equal(null)
		})

		it('calls back with the DbConnectError when the check fails', async () => {
			const { pool } = setup({ timeZone: 'Asia/Tokyo' })
			const result = await new Promise<unknown>((resolve) => {
				pool.checkoutWithCallback((error) => {
					resolve(error)
				})
			})
			expect(result).to.be.instanceOf(DbConnectError)
			expect((result as DbConnectError).reason).to.equal('TIMEZONE_NOT_UTC')
		})

		it('returns nothing from connect when a callback is given', () => {
			const { pool } = setup()
			const Client = pool.options['Client'] as new (o: unknown) => { connect(cb: (e?: Error | null) => void): unknown }
			expect(new Client(pool.options).connect(() => undefined)).to.equal(undefined)
		})
	})
})
