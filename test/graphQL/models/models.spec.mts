import { DevStatsGraphQLCalls } from '@models/MongoDB/log/DevStatsGraphQLCalls.mjs'
import { LogGlobalError } from '@models/MongoDB/log/LogGlobalError.mjs'
import { LogStatsGraphql } from '@models/MongoDB/log/LogStatsGraphql.mjs'
import { LogThrow } from '@models/MongoDB/log/LogThrow.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'

describe('graphQL/models/MongoDB/*', () => {
	it('DevStatsGraphQLCalls -> collection "devStatsGraphQLCalls"', () => {
		expect(DevStatsGraphQLCalls.modelName).to.equal('DevStatsGraphQLCalls')
		expect(DevStatsGraphQLCalls.collection.collectionName).to.equal('devStatsGraphQLCalls')
		const paths = DevStatsGraphQLCalls.schema.paths
		expect(paths.list).to.exist
		expect(paths.dataora).to.exist
		const defaultFn = (paths.dataora as unknown as { defaultValue: () => Date }).defaultValue
		expect(defaultFn()).to.be.instanceOf(Date)
	})

	it('LogGlobalError -> collection "logGlobalError" with m + s + i fields', () => {
		expect(LogGlobalError.modelName).to.equal('LogGlobalError')
		expect(LogGlobalError.collection.collectionName).to.equal('logGlobalError')
		const paths = LogGlobalError.schema.paths
		expect(paths.m).to.exist
		expect(paths.s).to.exist
		expect(paths.i).to.exist
	})

	it('LogStatsGraphql -> collection "logStatsGraphql" with u,n,s,m,i fields', () => {
		expect(LogStatsGraphql.modelName).to.equal('LogStatsGraphql')
		expect(LogStatsGraphql.collection.collectionName).to.equal('logStatsGraphql')
		for (const k of ['u', 'n', 's', 'm', 'i']) {
			expect(LogStatsGraphql.schema.paths[k], `missing path ${k}`).to.exist
		}
	})

	it('LogThrow -> collection "logThrow" with u,m,el,i fields', () => {
		expect(LogThrow.modelName).to.equal('LogThrow')
		expect(LogThrow.collection.collectionName).to.equal('logThrow')
		for (const k of ['u', 'm', 'el', 'i']) {
			expect(LogThrow.schema.paths[k], `missing path ${k}`).to.exist
		}
	})

	it('UserBase -> collection "user" with nested login + account.email', () => {
		expect(UserBase.modelName).to.equal('UserBase')
		expect(UserBase.collection.collectionName).to.equal('user')
		expect(UserBase.schema.path('login.email')).to.exist
		expect(UserBase.schema.path('login.password')).to.exist
		expect(UserBase.schema.path('account.email.valid')).to.exist
		expect(UserBase.schema.path('account.registrationDate')).to.exist
	})
})
