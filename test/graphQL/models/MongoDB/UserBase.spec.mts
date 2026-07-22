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

	it('account.resetHash is its own String path, distinct from account.email.hash', () => {
		// The password-reset token must never share the email-verification slot: different lifetime,
		// different throttle, different trust domain. See docs/code/graphql-models.md.
		expect(UserBase.schema.path('account.resetHash')).to.exist
		expect(UserBase.schema.path('account.resetHash').instance).to.equal('String')
		expect(UserBase.schema.path('account.email.hash').instance).to.equal('String')
	})

	it('account.disabled and account.deleted are Boolean, matching IUserBaseSchema', () => {
		// Regression guard. account.disabled was declared `type: String` while the interface said
		// boolean. Mongoose then cast a stored `false` to the string 'false' on hydrated reads —
		// truthy — so infoUserForLogin + _finalizeLoginCheck refused login to users who were not
		// disabled, and mailed them an "account disabled" notice. Storing `false` through Mongoose
		// wrote the string too, so the flag could not be cleared through this model at all.
		expect(UserBase.schema.path('account.disabled').instance).to.equal('Boolean')
		expect(UserBase.schema.path('account.deleted').instance).to.equal('Boolean')
	})

	it('casts the legacy string flags back to booleans on a hydrated read', () => {
		// What the schema change buys on un-migrated data: .exec() reads self-heal. .lean() reads do
		// not — Mongoose casting never runs there — which is why the stored values still have to go
		// through scripts/migrate-account-disabled-to-boolean.mjs.
		const path = UserBase.schema.path('account.disabled')

		expect(path.cast('false')).to.equal(false)
		expect(path.cast('true')).to.equal(true)
		expect(path.cast(false)).to.equal(false)
		expect(path.cast(true)).to.equal(true)
	})
})
