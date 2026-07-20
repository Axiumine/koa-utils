import { LogStatsGraphql } from '@models/MongoDB/log/LogStatsGraphql.mjs'
import { expect } from 'chai'

describe('graphQL/models/MongoDB/log/LogStatsGraphql', () => {
	it('LogStatsGraphql -> collection "logStatsGraphql" with u,n,s,m,i fields', () => {
		expect(LogStatsGraphql.modelName).to.equal('LogStatsGraphql')
		expect(LogStatsGraphql.collection.collectionName).to.equal('logStatsGraphql')
		for (const k of ['u', 'n', 's', 'm', 'i']) {
			expect(LogStatsGraphql.schema.paths[k], `missing path ${k}`).to.exist
		}
	})
})
