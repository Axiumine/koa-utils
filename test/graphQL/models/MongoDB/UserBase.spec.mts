import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { expect } from 'chai'

describe('graphQL/models/MongoDB/UserBase', () => {
	it('UserBase -> collection "user" with nested login + account.email', () => {
		expect(UserBase.modelName).to.equal('UserBase')
		expect(UserBase.collection.collectionName).to.equal('user')
		expect(UserBase.schema.path('login.email')).to.exist
		expect(UserBase.schema.path('login.password')).to.exist
		expect(UserBase.schema.path('account.email.valid')).to.exist
		expect(UserBase.schema.path('account.registrationDate')).to.exist
	})
})
