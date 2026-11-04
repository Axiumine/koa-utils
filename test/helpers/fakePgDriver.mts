import { EventEmitter } from 'node:events'

import type { IDbDriver } from '@lib/PostgreSQL/pool/IDbDriver.mjs'

// fake node-postgres module for createPool specs. No socket, no server. Follow real contract where factory touch it:
// Pool take options obj (Client, types, settings), new Client(options) have connect (promise OR callback), query, end.
// pool = EventEmitter, throw 'error' event nobody listen to

// step that never settle
export const HANG = Symbol('hang')
// SHOW timezone answer with no row
export const NO_ROW = Symbol('no row')

export interface IScript {
	// 'ok' | HANG | value to reject connect with. { error } wrap reject value → non-Error reject possible
	connect: 'ok' | typeof HANG | { error: unknown }
	// SHOW timezone answer: zone name | NO_ROW | HANG | { error } to reject with
	timeZone: string | typeof NO_ROW | typeof HANG | { error: unknown }
	// end() answer: resolve | reject (exercise .catch arrow in factory) | never settle (factory must not await it)
	end: 'ok' | 'reject' | typeof HANG
}

interface IFakeClientRecord {
	ended: number
	readonly options: Record<string, unknown>
}

export interface IFakeWorld {
	script: IScript
	// every client any pool made, in order
	clients: IFakeClientRecord[]
	// every options obj any pool got, in order
	poolOptions: Record<string, unknown>[]
	// statements clients were asked to run
	statements: string[]
}

export function newWorld(script: Partial<IScript> = {}): IFakeWorld {
	return { script: { connect: 'ok', timeZone: 'UTC', end: 'ok', ...script }, clients: [], poolOptions: [], statements: [] }
}

type TConnectCallback = (error?: Error | null) => void
type TClientClass = new (config: Record<string, unknown>) => { connect: (callback?: TConnectCallback) => unknown }

export class FakePool extends EventEmitter {
	readonly options: Record<string, unknown>
	constructor(options: Record<string, unknown>) {
		super()
		this.options = options
	}

	// what pool.connect() do with Client option: make client, connect it (promise form)
	async checkout(): Promise<unknown> {
		const Client = this.options['Client'] as TClientClass
		const client = new Client(this.options)
		await client.connect()
		return client
	}

	// same, callback form pg-pool use
	checkoutWithCallback(callback: TConnectCallback): void {
		const Client = this.options['Client'] as TClientClass
		new Client(this.options).connect(callback)
	}
}

// driver whose clients follow world.script
export function fakeDriver(world: IFakeWorld): IDbDriver<FakePool> {
	class Pool extends FakePool {
		constructor(options: Record<string, unknown>) {
			super(options)
			world.poolOptions.push(options)
		}
	}
	class Client {
		readonly record: IFakeClientRecord
		constructor(options: Record<string, unknown>) {
			this.record = { ended: 0, options }
			world.clients.push(this.record)
		}

		connect(callback?: TConnectCallback): Promise<unknown> | undefined {
			const how = world.script.connect
			// reject with raw script value on purpose, may be non-Error
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
			const settle = (): Promise<unknown> => (how === 'ok' ? Promise.resolve(this) : how === HANG ? new Promise(() => undefined) : Promise.reject(how.error))
			if (callback === undefined) return settle()
			settle().then(
				() => {
					callback(null)
				},
				(error: unknown) => {
					callback(error as Error)
				}
			)
			return undefined
		}

		query(text: string): Promise<{ rows: Record<string, unknown>[] }> {
			world.statements.push(text)
			const zone = world.script.timeZone
			if (zone === HANG) return new Promise(() => undefined)
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
			if (typeof zone === 'object') return Promise.reject(zone.error)
			return Promise.resolve({ rows: zone === NO_ROW ? [] : [{ TimeZone: zone }] })
		}

		end(): Promise<void> {
			this.record.ended += 1
			const how = world.script.end
			if (how === HANG) return new Promise(() => undefined)
			return how === 'reject' ? Promise.reject(new Error('end failed')) : Promise.resolve()
		}
	}
	return { Pool, Client, types: { getTypeParser: () => (value: string) => value } }
}
