import { DevStatsGraphQLCalls } from '@models/MongoDB/log/DevStatsGraphQLCalls.mjs'
import { expect } from 'chai'
import { Schema, Types } from 'mongoose'
import sinon from 'sinon'

describe('graphQL/models/MongoDB/log/DevStatsGraphQLCalls', () => {
	it('DevStatsGraphQLCalls -> collection "devStatsGraphQLCalls"', () => {
		expect(DevStatsGraphQLCalls.modelName).to.equal('DevStatsGraphQLCalls')
		expect(DevStatsGraphQLCalls.collection.collectionName).to.equal('devStatsGraphQLCalls')
		const paths = DevStatsGraphQLCalls.schema.paths
		expect(paths['list']).to.exist
		expect(paths['dataora']).to.exist
		const defaultFn = (paths['dataora'] as unknown as { defaultValue: () => Date }).defaultValue
		expect(defaultFn()).to.be.instanceOf(Date)
	})

	it('top-level field types + required flags are pinned', () => {
		const expected: Record<string, [string, boolean]> = {
			list: ['Array', true],
			dataora: ['Date', false],
			__v: ['Number', false]
		}
		for (const [k, [instance, required]] of Object.entries(expected)) {
			const p = DevStatsGraphQLCalls.schema.path(k)
			expect(p.instance, `type of ${k}`).to.equal(instance)
			expect(Boolean(p.isRequired), `required of ${k}`).to.equal(required)
		}
	})

	it('list element schema -> _id ObjectId req, name String req, hit Boolean optional', () => {
		const sub = (DevStatsGraphQLCalls.schema.path('list') as unknown as { schema: Schema }).schema
		const expected: Record<string, [string, boolean]> = {
			_id: ['ObjectId', true],
			name: ['String', true],
			hit: ['Boolean', false]
		}
		for (const [k, [instance, required]] of Object.entries(expected)) {
			const p = sub.path(k)
			expect(p.instance, `type of list.${k}`).to.equal(instance)
			expect(Boolean(p.isRequired), `required of list.${k}`).to.equal(required)
		}
	})

	it('element missing _id + name → validation errors on both, hit optional', () => {
		const err = new DevStatsGraphQLCalls({ list: [{}] }).validateSync()
		expect(Object.keys(err?.errors ?? {}).sort()).to.deep.equal(['list.0._id', 'list.0.name'])
	})

	it('complete doc validates', () => {
		const doc = new DevStatsGraphQLCalls({ list: [{ _id: new Types.ObjectId(), name: 'q' }] })
		expect(doc.validateSync()).to.equal(undefined)
	})

	describe('dataora default', () => {
		let clock: sinon.SinonFakeTimers
		beforeEach(() => {
			clock = sinon.useFakeTimers({ now: 1_700_000_000_000, toFake: ['Date'] })
		})
		afterEach(() => {
			clock.restore()
		})

		it('default → fresh Date at doc creation', () => {
			const a = new DevStatsGraphQLCalls({ list: [] })
			expect(a.dataora.getTime()).to.equal(1_700_000_000_000)
			clock.tick(5000)
			const b = new DevStatsGraphQLCalls({ list: [] })
			expect(b.dataora.getTime()).to.equal(1_700_000_005_000)
		})
	})
})
