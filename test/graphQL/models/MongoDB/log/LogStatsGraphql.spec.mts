import { LogStatsGraphql } from '@models/MongoDB/log/LogStatsGraphql.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

describe('graphQL/models/MongoDB/log/LogStatsGraphql', () => {
	it('LogStatsGraphql -> collection "logStatsGraphql" with u,n,s,m,i fields', () => {
		expect(LogStatsGraphql.modelName).to.equal('LogStatsGraphql')
		expect(LogStatsGraphql.collection.collectionName).to.equal('logStatsGraphql')
		for (const k of ['u', 'n', 's', 'm', 'i']) {
			expect(LogStatsGraphql.schema.paths[k], `missing path ${k}`).to.exist
		}
	})

	it('field types + required flags are pinned', () => {
		// instance → mongoose type; isRequired → required opt
		const expected: Record<string, [string, boolean]> = {
			u: ['Number', true],
			n: ['String', true],
			s: ['Number', true],
			m: ['Number', true],
			i: ['Date', false],
			__v: ['Number', false]
		}
		for (const [k, [instance, required]] of Object.entries(expected)) {
			const p = LogStatsGraphql.schema.path(k)
			expect(p.instance, `type of ${k}`).to.equal(instance)
			expect(Boolean(p.isRequired), `required of ${k}`).to.equal(required)
		}
	})

	it('empty doc → validation error on u, n, s, m only', () => {
		const err = new LogStatsGraphql({}).validateSync()
		expect(Object.keys(err?.errors ?? {}).sort()).to.deep.equal(['m', 'n', 's', 'u'])
	})

	it('complete doc validates', () => {
		expect(new LogStatsGraphql({ u: 1, n: 'x', s: 200, m: 5 }).validateSync()).to.equal(undefined)
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
			const a = new LogStatsGraphql({ u: 1, n: 'x', s: 200, m: 5 })
			expect(a.i).to.be.instanceOf(Date)
			expect(a.i.getTime()).to.equal(1_700_000_000_000)
			clock.tick(5000)
			const b = new LogStatsGraphql({ u: 1, n: 'x', s: 200, m: 5 })
			expect(b.i.getTime()).to.equal(1_700_000_005_000)
		})
	})
})
