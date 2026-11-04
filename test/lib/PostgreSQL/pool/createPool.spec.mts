import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { createPool } from '@lib/PostgreSQL/pool/createPool.mjs'
import { DEFAULT_CONNECT_TIMEOUT_MS } from '@lib/PostgreSQL/pool/DEFAULT_CONNECT_TIMEOUT_MS.mjs'
import { DEFAULT_KEEPALIVE_INITIAL_DELAY_MS } from '@lib/PostgreSQL/pool/DEFAULT_KEEPALIVE_INITIAL_DELAY_MS.mjs'
import { REQUIRED_SESSION_TIME_ZONE } from '@lib/PostgreSQL/pool/REQUIRED_SESSION_TIME_ZONE.mjs'
import { expect } from 'chai'

import { fakeDriver, newWorld } from '../../../helpers/fakePgDriver.mjs'
import { baseOptions, ENCODED, everythingAbout, PASSWORD, setup, URL_WITH_PASSWORD } from '../../../helpers/poolHarness.mjs'

describe('createPool: parameters, URL, what the driver is given', () => {
	describe('constants', () => {
		it('hold the documented defaults', () => {
			expect(DEFAULT_CONNECT_TIMEOUT_MS).to.equal(5000)
			expect(DEFAULT_KEEPALIVE_INITIAL_DELAY_MS).to.equal(10_000)
			expect(REQUIRED_SESSION_TIME_ZONE).to.equal('UTC')
		})
	})

	describe('the parameters', () => {
		const messageOf = (override: Record<string, unknown>): string => {
			try {
				createPool({ ...baseOptions(), ...override })
			} catch (error) {
				expect(error).to.be.instanceOf(TypeError)
				return (error as TypeError).message
			}
			return 'no error'
		}

		for (const max of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			it(`refuses max ${max}`, () => {
				expect(messageOf({ max })).to.equal('max must be a whole number from 1')
			})
		}

		for (const applicationName of ['', ' ', 'a b', '-lead', '.lead', 'has;semi', 'x'.repeat(64), 'ünï', 'a\n']) {
			it(`refuses applicationName ${JSON.stringify(applicationName)}`, () => {
				expect(messageOf({ applicationName })).to.match(/^applicationName must be 1 to 63 characters/)
			})
		}

		for (const applicationName of ['a', '0', 'app-uar', 'svc.v2:eu_1', 'x'.repeat(63)]) {
			it(`accepts applicationName ${JSON.stringify(applicationName)}`, () => {
				expect(messageOf({ applicationName })).to.equal('no error')
			})
		}

		for (const connectTimeoutMs of [0, -5, 1.5, Number.NaN]) {
			it(`refuses connectTimeoutMs ${connectTimeoutMs}`, () => {
				expect(messageOf({ connectTimeoutMs })).to.equal('connectTimeoutMs must be a whole number of milliseconds from 1')
			})
		}

		for (const keepAliveInitialDelayMs of [-1, 1.5, Number.NaN]) {
			it(`refuses keepAliveInitialDelayMs ${keepAliveInitialDelayMs}`, () => {
				expect(messageOf({ keepAliveInitialDelayMs })).to.equal('keepAliveInitialDelayMs must be a whole number of milliseconds from 0')
			})
		}

		it('accepts a max of 1, a keepalive delay of zero and a deadline of one millisecond', () => {
			expect(messageOf({ max: 1, keepAliveInitialDelayMs: 0, connectTimeoutMs: 1 })).to.equal('no error')
		})

		it('checks the parameters in order: max, applicationName, connectTimeoutMs, keepAliveInitialDelayMs', () => {
			const all = { max: 0, applicationName: '', connectTimeoutMs: 0, keepAliveInitialDelayMs: -1 }
			expect(messageOf(all)).to.match(/^max /)
			expect(messageOf({ ...all, max: 1 })).to.match(/^applicationName /)
			expect(messageOf({ ...all, max: 1, applicationName: 'a' })).to.match(/^connectTimeoutMs /)
			expect(messageOf({ ...all, max: 1, applicationName: 'a', connectTimeoutMs: 1 })).to.match(/^keepAliveInitialDelayMs /)
		})

		it('checks the parameters before the URL, and creates no pool when one is refused', () => {
			const world = newWorld()
			expect(() => createPool({ ...baseOptions(), driver: fakeDriver(world), max: 0, url: 'not a url' })).to.throw(TypeError)
			expect(world.poolOptions).to.have.lengthOf(0)
		})
	})

	describe('the URL', () => {
		const refused = [
			'not a url',
			'',
			'postgres://',
			'postgres:///db',
			'mysql://u@h/db',
			'http://u@h/db',
			`postgres://u:${PASSWORD}@h:5432/db?application_name=other`,
			'postgres://u@h:5432/db?sslmode=verify-full&sslmode=disable',
			'postgres://u@h:5432/db?host=other',
			'postgres://u@h:5432/db?password=x',
			'postgres://u@h:5432/db#fragment'
		]
		for (const url of refused) {
			it(`refuses ${JSON.stringify(url)} with URL_INVALID and an error that holds none of it`, () => {
				const world = newWorld()
				let caught: unknown
				try {
					createPool({ ...baseOptions(), driver: fakeDriver(world), url, max: 1 })
				} catch (error) {
					caught = error
				}
				expect(caught).to.be.instanceOf(DbConnectError)
				expect((caught as DbConnectError).reason).to.equal('URL_INVALID')
				expect((caught as DbConnectError).code).to.equal(undefined)
				const text = everythingAbout(caught, [])
				for (const piece of [PASSWORD, 'other', 'fragment']) expect(text).to.not.contain(piece)
				expect(world.poolOptions).to.have.lengthOf(0)
			})
		}

		const accepted = [
			'postgres://u@127.0.0.1:5432/db',
			'postgresql://u:p@host.example:5432/db?sslmode=verify-full',
			'postgres://u@host.example:5432/db?sslmode=verify-full&sslrootcert=%2Fetc%2Fca-bundle.crt',
			'postgres://u@[::1]:5432/db',
			// query with each allowed key once, either order
			'postgres://u@h:5432/db?sslrootcert=%2Fca&sslmode=verify-full'
		]
		for (const url of accepted) {
			it(`accepts ${JSON.stringify(url)}`, () => {
				expect(() => createPool({ ...baseOptions(), url, max: 1 })).to.not.throw()
			})
		}
	})

	describe('what the driver is given', () => {
		it('gets the pool settings and no connection timeout of its own', () => {
			const { world, pool } = setup()
			expect(world.poolOptions).to.have.lengthOf(1)
			const options = world.poolOptions[0] ?? {}
			expect(options['connectionString']).to.equal(URL_WITH_PASSWORD)
			expect(options['max']).to.equal(4)
			expect(options['application_name']).to.equal('app-test')
			expect(options['keepAlive']).to.equal(true)
			expect(options['keepAliveInitialDelayMillis']).to.equal(DEFAULT_KEEPALIVE_INITIAL_DELAY_MS)
			expect(Object.keys(options)).to.not.include('connectionTimeoutMillis')
			expect((options['types'] as { getTypeParser: unknown }).getTypeParser).to.be.a('function')
			expect(options['Client']).to.be.a('function')
			expect(pool.options).to.equal(options)
		})

		it('passes the keepalive settings it was given', () => {
			const { world } = setup({}, { keepAlive: false, keepAliveInitialDelayMs: 2500 })
			expect(world.poolOptions[0]?.['keepAlive']).to.equal(false)
			expect(world.poolOptions[0]?.['keepAliveInitialDelayMillis']).to.equal(2500)
		})

		it('passes a keepalive delay of zero as zero, not as the default', () => {
			const { world } = setup({}, { keepAliveInitialDelayMs: 0 })
			expect(world.poolOptions[0]?.['keepAliveInitialDelayMillis']).to.equal(0)
		})

		it('puts the string parsers in the types option and the other types to the driver', () => {
			const { world } = setup()
			const types = world.poolOptions[0]?.['types'] as { getTypeParser(oid: number, format?: string): (text: string) => unknown }
			expect(types.getTypeParser(1082)('2024-03-10')).to.equal('2024-03-10')
			expect(types.getTypeParser(1184)('2024-03-10 03:30:00-07')).to.equal('2024-03-10T10:30:00.000Z')
			expect(types.getTypeParser(25)('plain')).to.equal('plain')
		})

		it('makes a registry per pool', () => {
			const world = newWorld()
			const make = () => createPool({ ...baseOptions(), driver: fakeDriver(world), max: 1 })
			make()
			make()
			expect(world.poolOptions[0]?.['types']).to.not.equal(world.poolOptions[1]?.['types'])
		})

		it('makes the clients of the pool from the Client of the driver', async () => {
			const { world, pool } = setup()
			await pool.checkout()
			expect(world.clients).to.have.lengthOf(1)
			expect(world.clients[0]?.options).to.equal(world.poolOptions[0])
		})

		it('returns the instance of the Pool class of the driver', () => {
			const { pool } = setup()
			expect(pool.constructor.name).to.equal('Pool')
		})

		it('keeps the password out of every setting but connectionString', () => {
			const { world } = setup()
			const options = world.poolOptions[0] ?? {}
			const { connectionString: _kept, ...rest } = options
			expect(JSON.stringify(rest, (_key, value: unknown) => (typeof value === 'function' ? 'fn' : value))).to.not.contain(ENCODED)
		})
	})
})
