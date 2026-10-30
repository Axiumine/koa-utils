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

	// path → [instance, required]. Required flags = observable contract: a flipped flag either lets a
	// half-built row in or refuses a valid one.
	const FIELDS: Record<string, [string, boolean]> = {
		login: ['Embedded', true],
		'login.email': ['String', true],
		'login.password': ['String', true],
		'login.firstLogin': ['Date', false],
		'login.lastLogin': ['Date', false],
		account: ['Embedded', true],
		'account.email': ['Embedded', true],
		'account.email.valid': ['Boolean', true],
		'account.email.dateLastReq': ['Date', false],
		'account.email.requestTimes': ['Number', false],
		'account.email.hash': ['String', false],
		'account.email.newEmailTmp': ['String', false],
		'account.onboardingStep': ['String', false],
		'account.onboardingDone': ['Boolean', false],
		'account.rememberMe': ['Boolean', false],
		'account.registrationDate': ['Date', true],
		'account.accountValidDate': ['Date', false],
		'account.newsletter': ['Boolean', false],
		'account.resetDateReq': ['Date', false],
		'account.resetHash': ['String', false],
		'account.disabled': ['Boolean', false],
		'account.deleted': ['Boolean', false],
		personalData: ['Embedded', false],
		'personalData.name': ['String', true],
		__v: ['Number', false]
	}

	for (const [path, [instance, required]] of Object.entries(FIELDS)) {
		it(`${path} is a ${required ? 'required' : 'optional'} ${instance}`, () => {
			const schemaType = UserBase.schema.path(path)

			expect(schemaType, `${path} missing`).to.exist
			expect(schemaType.instance).to.equal(instance)
			expect(schemaType.isRequired).to.equal(required)
		})
	}

	it('declares exactly these top-level and nested paths, nothing more', () => {
		const declared = [...Object.keys(UserBase.schema.paths), ...Object.keys(UserBase.schema.singleNestedPaths)]
		const expected = [...Object.keys(FIELDS), '_id']

		expect([...new Set(declared)].sort()).to.deep.equal([...expected].sort())
	})

	it('sub-documents carry no _id of their own', () => {
		const doc = new UserBase({
			login: { email: 'a@test.com', password: 'x' },
			account: { email: { valid: true }, registrationDate: new Date() },
			personalData: { name: 'n' }
		})

		expect(doc.toObject().login).to.not.have.property('_id')
		expect(doc.toObject().account).to.not.have.property('_id')
		expect(doc.toObject().account.email).to.not.have.property('_id')
		expect(doc.toObject().personalData).to.not.have.property('_id')
	})

	it('an empty document fails validation on login and account only', async () => {
		let thrown: { errors: Record<string, unknown> } | undefined
		try {
			await new UserBase({}).validate()
		} catch (e) {
			thrown = e as { errors: Record<string, unknown> }
		}

		expect(Object.keys(thrown?.errors ?? {}).sort()).to.deep.equal(['account', 'login'])
	})

	it('a fully populated document validates', async () => {
		const doc = new UserBase({
			login: { email: 'a@test.com', password: 'x' },
			account: { email: { valid: false }, registrationDate: new Date() }
		})

		await doc.validate()
	})
})
