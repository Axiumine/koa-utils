/**
 * Tests for private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mts
 *
 * Only the schema shape asserted — the model has no behaviour of its own. Flag types matter:
 * infoUserAdminForLogin read with .exec() → Mongoose casting decide what _finalizeLoginCheck see.
 */
import UserAdminKoaUtils from '@private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mjs'
import { expect } from 'chai'

describe('private/graphQL/models/MongoDB/private/UserAdminKoaUtils', () => {
	it('maps to the "userAdmin" collection with nested login + account.email', () => {
		expect(UserAdminKoaUtils.modelName).to.equal('UserAdminKoaUtils')
		expect(UserAdminKoaUtils.collection.collectionName).to.equal('userAdmin')
		expect(UserAdminKoaUtils.schema.path('login.email')).to.exist
		expect(UserAdminKoaUtils.schema.path('login.password')).to.exist
		expect(UserAdminKoaUtils.schema.path('account.email.valid')).to.exist
	})

	it('account.disabled and account.deleted are Boolean, matching IUserAdminKoaUtilsSchema', () => {
		// Same defect as UserBase: declared `type: String` while the interface said boolean → a stored `false`
		// hydrated to the truthy string 'false' and locked out admins who were not disabled. Existing rows are
		// repaired by scripts/migrate-account-disabled-to-boolean.mjs.
		expect(UserAdminKoaUtils.schema.path('account.disabled').instance).to.equal('Boolean')
		expect(UserAdminKoaUtils.schema.path('account.deleted').instance).to.equal('Boolean')
	})

	// Schema shape = contract. Table: path → [instance, required]. Mutants flip required, drop type.
	const SHAPE: Array<[string, string, boolean]> = [
		['login', 'Embedded', true],
		['login.email', 'String', true],
		['login.password', 'String', true],
		['login.firstLogin', 'Date', false],
		['login.lastLogin', 'Date', false],
		['account', 'Embedded', true],
		['account.email', 'Embedded', true],
		['account.email.valid', 'Boolean', true],
		['account.email.dateLastReq', 'Date', false],
		['account.email.requestTimes', 'Number', false],
		['account.email.hash', 'String', false],
		['account.email.newEmailTmp', 'String', false],
		['account.rememberMe', 'Boolean', false],
		['account.registrationDate', 'Date', true],
		['account.accountValidDate', 'Date', false],
		['account.newsletter', 'Boolean', false],
		['account.resetDateReq', 'Date', false],
		['account.disabled', 'Boolean', false],
		['account.deleted', 'Boolean', false],
		['personalData', 'Embedded', true],
		['personalData.name', 'String', true],
		['personalData.surname', 'String', true],
		['__v', 'Number', false]
	]

	for (const [path, instance, required] of SHAPE) {
		it(`schema path ${path} is ${instance}, ${required ? 'required' : 'optional'}`, () => {
			const schemaType = UserAdminKoaUtils.schema.path(path)
			expect(schemaType.instance).to.equal(instance)
			expect(schemaType.isRequired).to.equal(required)
			expect(schemaType.options['required']).to.equal(required)
		})
	}

	it('nested objects declare _id:false → hydrated doc has no _id on login, account, account.email, personalData', () => {
		const doc = new UserAdminKoaUtils({
			login: { email: 'a@b.c', password: 'x' },
			account: { email: { valid: true }, registrationDate: new Date(0) },
			personalData: { name: 'n', surname: 's' }
		}).toObject() as unknown as Record<string, Record<string, unknown>>
		expect(doc['login']).to.not.have.property('_id')
		expect(doc['account']).to.not.have.property('_id')
		expect(doc['account']?.['email']).to.not.have.property('_id')
		expect(doc['personalData']).to.not.have.property('_id')
	})
})
