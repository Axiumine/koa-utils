/**
 * Tests for private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mts
 *
 * Only the schema shape is asserted here — the model has no behaviour of its own. The flag types
 * matter because infoUserAdminForLogin reads with .exec(), so Mongoose casting decides what
 * _finalizeLoginCheck sees.
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
		// Same defect as UserBase: declared `type: String` while the interface said boolean, so a
		// stored `false` hydrated to the truthy string 'false' and locked out admins who were not
		// disabled. Existing rows are repaired by scripts/migrate-account-disabled-to-boolean.mjs.
		expect(UserAdminKoaUtils.schema.path('account.disabled').instance).to.equal('Boolean')
		expect(UserAdminKoaUtils.schema.path('account.deleted').instance).to.equal('Boolean')
	})
})
