import { LogGlobalError } from '@models/MongoDB/log/LogGlobalError.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

describe('graphQL/models/MongoDB/log/LogGlobalError', () => {
	it('LogGlobalError -> collection "logGlobalError" with m + s + i fields', () => {
		expect(LogGlobalError.modelName).to.equal('LogGlobalError')
		expect(LogGlobalError.collection.collectionName).to.equal('logGlobalError')
		for (const k of ['m', 's', 'i']) {
			expect(LogGlobalError.schema.paths[k], `missing path ${k}`).to.exist
		}
	})

	it('field types + required flags are pinned', () => {
		// instance → mongoose type; isRequired → required opt
		const expected: Record<string, [string, boolean]> = {
			m: ['String', true],
			s: ['Array', true],
			i: ['Date', false],
			__v: ['Number', false]
		}
		for (const [k, [instance, required]] of Object.entries(expected)) {
			const p = LogGlobalError.schema.path(k)
			expect(p.instance, `type of ${k}`).to.equal(instance)
			expect(Boolean(p.isRequired), `required of ${k}`).to.equal(required)
		}
	})

	it('empty doc → validation error on m only (empty array satisfies s)', () => {
		const err = new LogGlobalError({}).validateSync()
		expect(Object.keys(err?.errors ?? {}).sort()).to.deep.equal(['m'])
	})

	it('s is an array of strings: elements cast to String', () => {
		// [String] not untyped [] → number element cast to '1'
		const doc = new LogGlobalError({ m: 'x', s: [1, 'b'] as unknown as string[] })
		expect([...doc.s]).to.deep.equal(['1', 'b'])
	})

	it('complete doc validates', () => {
		expect(new LogGlobalError({ m: 'x', s: ['a'] }).validateSync()).to.equal(undefined)
	})

	describe('i default', () => {
		let clock: sinon.SinonFakeTimers
		beforeEach(() => {
			clock = sinon.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date'] })
		})
		afterEach(() => {
			clock.restore()
		})

		it('default → fresh Date at doc creation', () => {
			const a = new LogGlobalError({ m: 'x', s: ['a'] })
			expect(a.i).to.be.instanceOf(Date)
			expect(a.i.getTime()).to.equal(1_700_000_000_000)
			clock.tick(5000)
			const b = new LogGlobalError({ m: 'x', s: ['a'] })
			expect(b.i.getTime()).to.equal(1_700_000_005_000)
		})
	})
})
