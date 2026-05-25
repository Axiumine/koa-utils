import { DevStatsGraphQLCalls } from '@models/MongoDB/log/DevStatsGraphQLCalls.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { hitStat } from '../../../../dist/lib/db/log/hitStat.mjs'

describe('hitStat', () => {
	let findStub: sinon.SinonStub
	let updateOneStub: sinon.SinonStub

	const fakeId = new Types.ObjectId()

	// Helper: builds a chainable stub for find().select().sort().limit().lean()
	function makeChain(result: unknown) {
		const chain = {
			select: sinon.stub().returnsThis(),
			sort: sinon.stub().returnsThis(),
			limit: sinon.stub().returnsThis(),
			lean: sinon.stub().resolves(result)
		}
		return chain
	}

	afterEach(() => {
		sinon.restore()
	})

	it('calls find then updateOne with the correct document _id and call name', async () => {
		const chain = makeChain([{ _id: fakeId }])
		findStub = sinon.stub(DevStatsGraphQLCalls, 'find').returns(chain as never)
		updateOneStub = sinon.stub(DevStatsGraphQLCalls, 'updateOne').resolves({ modifiedCount: 1 } as never)

		await hitStat('myCall')

		expect(findStub.calledOnce).to.be.true
		expect(chain.select.calledWith('_id')).to.be.true
		expect(chain.sort.calledWith({ dataora: -1 })).to.be.true
		expect(chain.limit.calledWith(1)).to.be.true
		expect(chain.lean.calledOnce).to.be.true
		expect(updateOneStub.calledOnceWith({ _id: fakeId, 'list.name': 'myCall' }, { 'list.$.hit': true }, { runValidators: true })).to.be.true
	})

	it('returns the result of updateOne', async () => {
		const updateResult = { modifiedCount: 1, matchedCount: 1 }
		const chain = makeChain([{ _id: fakeId }])
		sinon.stub(DevStatsGraphQLCalls, 'find').returns(chain as never)
		sinon.stub(DevStatsGraphQLCalls, 'updateOne').resolves(updateResult as never)

		const result = await hitStat('anotherCall')

		expect(result).to.deep.equal(updateResult)
	})
})
