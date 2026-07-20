import { LogGlobalError } from '@models/MongoDB/log/LogGlobalError.mjs'
import { expect } from 'chai'

describe('graphQL/models/MongoDB/log/LogGlobalError', () => {
	it('LogGlobalError -> collection "logGlobalError" with m + s + i fields', () => {
		expect(LogGlobalError.modelName).to.equal('LogGlobalError')
		expect(LogGlobalError.collection.collectionName).to.equal('logGlobalError')
		const paths = LogGlobalError.schema.paths
		expect(paths.m).to.exist
		expect(paths.s).to.exist
		expect(paths.i).to.exist
	})
})
