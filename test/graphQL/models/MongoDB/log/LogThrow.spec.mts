import { LogThrow } from '@models/MongoDB/log/LogThrow.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

describe('graphQL/models/MongoDB/log/LogThrow', () => {
	it('LogThrow -> collection "logThrow" with u,m,el,i fields', () => {
		expect(LogThrow.modelName).to.equal('LogThrow')
		expect(LogThrow.collection.collectionName).to.equal('logThrow')
		for (const k of ['u', 'm', 'el', 'i']) {
			expect(LogThrow.schema.paths[k], `missing path ${k}`).to.exist
		}
	})

	it('field types + required flags are pinned', () => {
		// instance → mongoose type; isRequired → required opt
		const expected: Record<string, [string, boolean]> = {
			u: ['Number', true],
			m: ['String', true],
			el: ['Number', true],
			i: ['Date', false],
			__v: ['Number', false]
		}
		for (const [k, [instance, required]] of Object.entries(expected)) {
			const p = LogThrow.schema.path(k)
			expect(p.instance, `type of ${k}`).to.equal(instance)
			expect(Boolean(p.isRequired), `required of ${k}`).to.equal(required)
		}
	})

	it('empty doc → validation error on u, m, el only', () => {
		const err = new LogThrow({}).validateSync()
		expect(Object.keys(err?.errors ?? {}).sort()).to.deep.equal(['el', 'm', 'u'])
	})

	it('complete doc validates', () => {
		expect(new LogThrow({ u: 1, m: 'x', el: 2 }).validateSync()).to.equal(undefined)
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
			const a = new LogThrow({ u: 1, m: 'x', el: 2 })
			expect(a.i).to.be.instanceOf(Date)
			expect(a.i.getTime()).to.equal(1_700_000_000_000)
			clock.tick(5000)
			const b = new LogThrow({ u: 1, m: 'x', el: 2 })
			expect(b.i.getTime()).to.equal(1_700_000_005_000)
		})
	})
})
