import { DevStatsGraphQLCalls } from '@models/MongoDB/log/DevStatsGraphQLCalls.mjs'
import { expect } from 'chai'

describe('graphQL/models/MongoDB/log/DevStatsGraphQLCalls', () => {
	it('DevStatsGraphQLCalls -> collection "devStatsGraphQLCalls"', () => {
		expect(DevStatsGraphQLCalls.modelName).to.equal('DevStatsGraphQLCalls')
		expect(DevStatsGraphQLCalls.collection.collectionName).to.equal('devStatsGraphQLCalls')
		const paths = DevStatsGraphQLCalls.schema.paths
		expect(paths.list).to.exist
		expect(paths.dataora).to.exist
		const defaultFn = (paths.dataora as unknown as { defaultValue: () => Date }).defaultValue
		expect(defaultFn()).to.be.instanceOf(Date)
	})
})
