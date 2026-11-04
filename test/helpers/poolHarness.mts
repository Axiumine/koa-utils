import type { IPoolCounterName } from '@lib/PostgreSQL/pool/IPoolCounterName.mjs'
import { createPool } from '@lib/PostgreSQL/pool/createPool.mjs'

import { fakeDriver, type FakePool, newWorld, type IScript } from './fakePgDriver.mjs'
import { type ILogCall, recordingLogger } from './recordingLogger.mjs'

// password planted in URL. Looked for in every error, log call, serialisation
export const PASSWORD = 'pl4nted-Pa55!word'
export const ENCODED = 'pl4nted-Pa55%21word'
export const URL_WITH_PASSWORD = `postgres://app_role:${ENCODED}@127.0.0.1:5432/app_test`

// every way an error can show text: message, stack, JSON, String, own props, + the log calls
export function everythingAbout(error: unknown, calls: readonly ILogCall[]): string {
	const e = error as Error
	return [
		e.message,
		e.stack ?? '',
		JSON.stringify(e),
		String(e),
		JSON.stringify(Object.getOwnPropertyDescriptors(e), (_key, value: unknown) => (typeof value === 'function' ? 'fn' : value)),
		JSON.stringify(calls)
	].join('\n')
}

export interface IPoolSetup {
	world: ReturnType<typeof newWorld>
	log: ReturnType<typeof recordingLogger>
	counts: IPoolCounterName[]
	pool: FakePool
}

// pool on fake driver, counter recorded. overrides win over defaults
export function setup(script: Partial<IScript> = {}, overrides: Record<string, unknown> = {}): IPoolSetup {
	const world = newWorld(script)
	const log = recordingLogger()
	const counts: IPoolCounterName[] = []
	const pool = createPool({
		driver: fakeDriver(world),
		url: URL_WITH_PASSWORD,
		max: 4,
		applicationName: 'app-test',
		logger: log.logger,
		counter: (name) => void counts.push(name),
		...overrides
	})
	return { world, log, counts, pool }
}

// valid options for a refusal spec to spread over. fresh world each call
export function baseOptions() {
	return { driver: fakeDriver(newWorld()), url: URL_WITH_PASSWORD, max: 4, applicationName: 'app-test', logger: recordingLogger().logger }
}
