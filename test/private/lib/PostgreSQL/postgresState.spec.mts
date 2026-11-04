import { DbStateError } from '@lib/PostgreSQL/error/DbStateError.mjs'
import { postgresState } from '@private/lib/PostgreSQL/postgresState.mjs'
import { expect } from 'chai'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { failureOf } from '../../../helpers/recordingTx.mjs'

type TStateModule = typeof import('@private/lib/PostgreSQL/postgresState.mjs')

const KEY = Symbol.for('@axiumine/koa-utils/postgres-state')
const URL_OF_STATE = pathToFileURL(resolve(process.cwd(), 'dist/private/lib/PostgreSQL/postgresState.mjs')).href

let seq = 0
// fresh instance of the built module: own module-level code runs again, deps come from cache. Not a re-read of the cache
const freshLoad = (): Promise<TStateModule> => import(`${URL_OF_STATE}?copy=${String(++seq)}`) as Promise<TStateModule>

// run with the global slot emptied or planted. Original descriptor put back whatever happens
async function withSlot<T>(plant: ((set: (value: unknown) => void) => void) | undefined, run: () => Promise<T>): Promise<T> {
	const saved = Object.getOwnPropertyDescriptor(globalThis, KEY)
	try {
		Reflect.deleteProperty(globalThis, KEY)
		plant?.((value) => Reflect.set(globalThis, KEY, value))
		return await run()
	} finally {
		Reflect.deleteProperty(globalThis, KEY)
		if (saved !== undefined) Object.defineProperty(globalThis, KEY, saved)
	}
}

describe('postgresState: the registry on globalThis', () => {
	it('is the object that sits under the registry symbol, read-only, not enumerable, frozen', () => {
		expect(Reflect.get(globalThis, KEY)).to.equal(postgresState)
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, KEY)
		expect(descriptor).to.deep.include({ enumerable: false, writable: false, configurable: true })
		expect(Object.isFrozen(postgresState)).to.equal(true)
		expect(postgresState.layout).to.equal(1)
		expect(postgresState.slots).to.be.instanceOf(WeakMap)
		expect(Object.keys(postgresState).sort()).to.deep.equal(['layout', 'slots'])
	})

	it('is not writable: an assignment is refused and the registry stays', () => {
		expect(Reflect.set(globalThis, KEY, {})).to.equal(false)
		expect(Reflect.get(globalThis, KEY)).to.equal(postgresState)
	})
})

describe('postgresState: a second copy of the module joins the registry', () => {
	it('is another module instance that holds the very same registry', async () => {
		const copy = await freshLoad()
		expect(copy).to.not.equal(await import('@private/lib/PostgreSQL/postgresState.mjs'))
		expect(copy.postgresState).to.equal(postgresState)
		expect(Reflect.get(globalThis, KEY)).to.equal(postgresState)
	})

	it('sees what the first copy stores, and the first copy sees what it stores', async () => {
		const copy = await freshLoad()
		const handle = {}
		const slot = { locked: true, instant: 7, pending: undefined, read: undefined }
		postgresState.slots.set(handle, slot)
		expect(copy.postgresState.slots.get(handle)).to.equal(slot)
		const other = {}
		copy.postgresState.slots.set(other, slot)
		expect(postgresState.slots.get(other)).to.equal(slot)
	})
})

describe('postgresState: nothing registered yet', () => {
	it('the first load makes the registry, puts it on globalThis and keeps it empty', async () => {
		await withSlot(undefined, async () => {
			expect(Reflect.get(globalThis, KEY)).to.equal(undefined)
			const first = await freshLoad()
			expect(first.postgresState).to.not.equal(postgresState)
			expect(Reflect.get(globalThis, KEY)).to.equal(first.postgresState)
			expect(first.postgresState.layout).to.equal(1)
			expect(Object.isFrozen(first.postgresState)).to.equal(true)
			expect(first.postgresState.slots.get(postgresState)).to.equal(undefined)
			// a later copy joins the one just made
			expect((await freshLoad()).postgresState).to.equal(first.postgresState)
		})
		expect(Reflect.get(globalThis, KEY)).to.equal(postgresState)
	})
})

describe('postgresState: a registry of another layout is refused', () => {
	const FOREIGN: [string, unknown][] = [
		['a registry of another layout', { layout: 2, slots: new WeakMap() }],
		['an object without a layout', {}],
		['an older layout', { layout: 0, slots: new WeakMap() }],
		['the layout as text', { layout: '1', slots: new WeakMap() }],
		['null', null],
		['a number', 1],
		['text', 'registry'],
		['a function', () => undefined]
	]
	for (const [name, planted] of FOREIGN) {
		it(`throws DbStateError LAYOUT_MISMATCH at load for ${name}, and leaves the value alone`, async () => {
			await withSlot(
				(set) => {
					set(planted)
				},
				async () => {
					const error = await failureOf(freshLoad())
					expect(error).to.be.instanceOf(DbStateError)
					expect(error).to.deep.include({ reason: 'LAYOUT_MISMATCH' })
					expect((error as DbStateError).message).to.contain('keep one version of @axiumine/koa-utils installed')
					expect(Reflect.get(globalThis, KEY)).to.equal(planted)
				}
			)
		})
	}

	it('accepts a registry of this layout even when it was made elsewhere, and uses it', async () => {
		const mine = { layout: 1, slots: new WeakMap() }
		await withSlot(
			(set) => {
				set(mine)
			},
			async () => {
				expect((await freshLoad()).postgresState).to.equal(mine)
			}
		)
	})
})
