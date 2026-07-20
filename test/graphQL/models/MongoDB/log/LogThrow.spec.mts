import { LogThrow } from '@models/MongoDB/log/LogThrow.mjs'
import { expect } from 'chai'

describe('graphQL/models/MongoDB/log/LogThrow', () => {
	it('LogThrow -> collection "logThrow" with u,m,el,i fields', () => {
		expect(LogThrow.modelName).to.equal('LogThrow')
		expect(LogThrow.collection.collectionName).to.equal('logThrow')
		for (const k of ['u', 'm', 'el', 'i']) {
			expect(LogThrow.schema.paths[k], `missing path ${k}`).to.exist
		}
	})
})
