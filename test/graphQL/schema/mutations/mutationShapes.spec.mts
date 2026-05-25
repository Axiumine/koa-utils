import { emailChangeHashVerify } from '../../../../dist/graphQL/schema/mutations/emailChangeHashVerify.mjs'
import { login4Ever } from '../../../../dist/graphQL/schema/mutations/login4Ever.mjs'
import { loginAdmin } from '../../../../dist/graphQL/schema/mutations/loginAdmin.mjs'
import { loginRememberme } from '../../../../dist/graphQL/schema/mutations/loginRememberme.mjs'
import { logout } from '../../../../dist/graphQL/schema/mutations/logout.mjs'
import { refresh } from '../../../../dist/graphQL/schema/mutations/refresh.mjs'
import { resetPwd } from '../../../../dist/graphQL/schema/mutations/resetPwd.mjs'
import { signUp } from '../../../../dist/graphQL/schema/mutations/signUp.mjs'
import { updatePassword } from '../../../../dist/graphQL/schema/mutations/updatePassword.mjs'
import { expect } from 'chai'

const mutations = {
	emailChangeHashVerify,
	login4Ever,
	loginAdmin,
	loginRememberme,
	logout,
	refresh,
	resetPwd,
	signUp,
	updatePassword
}

describe('graphQL/schema/mutations — shape (description/type/resolve)', () => {
	for (const [name, m] of Object.entries(mutations)) {
		it(`${name}: has description, NonNull type, resolve fn`, () => {
			expect(m.description, `${name}.description missing`).to.be.a('string')
			expect(m.description).to.not.equal('')
			expect(m.type, `${name}.type missing`).to.exist
			expect(m.type.toString()).to.match(/!$/)
			expect(m.resolve, `${name}.resolve missing`).to.be.a('function')
		})
	}

	it('login4Ever args = { email!, password! }', () => {
		expect(Object.keys(login4Ever.args).sort()).to.deep.equal(['email', 'password'])
		expect(login4Ever.args.email.type.toString()).to.equal('String!')
		expect(login4Ever.args.password.type.toString()).to.equal('String!')
	})

	it('loginAdmin args include rememberMe Boolean!', () => {
		expect(loginAdmin.args.rememberMe.type.toString()).to.equal('Boolean!')
	})

	it('loginRememberme args include rememberMe Boolean!', () => {
		expect(loginRememberme.args.rememberMe.type.toString()).to.equal('Boolean!')
	})

	it('signUp args = { email!, password! }', () => {
		expect(Object.keys(signUp.args).sort()).to.deep.equal(['email', 'password'])
	})

	it('updatePassword args = { email!, hash!, password! }', () => {
		expect(Object.keys(updatePassword.args).sort()).to.deep.equal([
			'email',
			'hash',
			'password'
		])
	})

	it('resetPwd args = { email! }', () => {
		expect(Object.keys(resetPwd.args)).to.deep.equal(['email'])
	})

	it('emailChangeHashVerify args = { email!, hash! }', () => {
		expect(Object.keys(emailChangeHashVerify.args).sort()).to.deep.equal([
			'email',
			'hash'
		])
	})

	it('logout / refresh expose only description+type+resolve (no args)', () => {
		expect('args' in logout).to.equal(false)
		expect('args' in refresh).to.equal(false)
	})
})
