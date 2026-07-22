/**
 * Tests for lib/access/accessPaths.mts
 *
 * The defaults are a published contract: they are exactly what the flows did before they took a
 * `paths` map, so a change here silently repoints every consumer that did not override the key.
 * They are asserted literally, not derived, on purpose.
 */
import {
	DEFAULT_RESET_PWD_PATHS,
	DEFAULT_VERIFY_EMAIL_PATHS,
	resolveResetPwdPaths,
	resolveVerifyEmailPaths
} from '../../../dist/lib/access/accessPaths.mjs'
import { expect } from 'chai'

describe('DEFAULT_RESET_PWD_PATHS', () => {
	it('is the UserBase layout, verbatim', () => {
		expect(DEFAULT_RESET_PWD_PATHS).to.deep.equal({
			email: 'login.email',
			password: 'login.password',
			name: 'personalData.name',
			resetDateReq: 'account.resetDateReq',
			resetHash: 'account.resetHash',
			resetClear: ['account.resetDateReq', 'account.resetHash']
		})
	})

	it('is frozen, so a consumer cannot mutate the defaults of every other consumer', () => {
		expect(Object.isFrozen(DEFAULT_RESET_PWD_PATHS)).to.equal(true)
		expect(Object.isFrozen(DEFAULT_RESET_PWD_PATHS.resetClear)).to.equal(true)
	})

	it('keeps resetHash disjoint from the verification hash slot', () => {
		expect(DEFAULT_RESET_PWD_PATHS.resetHash).to.not.equal(DEFAULT_VERIFY_EMAIL_PATHS.hash)
	})
})

describe('resolveResetPwdPaths', () => {
	it('with no argument returns the defaults', () => {
		expect(resolveResetPwdPaths()).to.deep.equal({ ...DEFAULT_RESET_PWD_PATHS })
	})

	it('overrides only the keys supplied', () => {
		const resolved = resolveResetPwdPaths({ email: 'mail', name: 'profile.fullName' })
		expect(resolved.email).to.equal('mail')
		expect(resolved.name).to.equal('profile.fullName')
		expect(resolved.password).to.equal('login.password')
		expect(resolved.resetClear).to.deep.equal(['account.resetDateReq', 'account.resetHash'])
	})

	it('takes resetClear as given — it is never derived from the leaf paths', () => {
		// the strict-subdocument layout: one container path to unset, two leaves to read
		const resolved = resolveResetPwdPaths({
			resetDateReq: 'resetPwd.resetDateReq',
			resetHash: 'resetPwd.resetHash',
			resetClear: ['resetPwd']
		})
		expect(resolved.resetClear).to.deep.equal(['resetPwd'])
	})

	it('does not return the frozen default object itself', () => {
		expect(resolveResetPwdPaths()).to.not.equal(DEFAULT_RESET_PWD_PATHS)
	})
})

describe('DEFAULT_VERIFY_EMAIL_PATHS', () => {
	it('is the UserBase layout, verbatim', () => {
		expect(DEFAULT_VERIFY_EMAIL_PATHS).to.deep.equal({
			email: 'login.email',
			valid: 'account.email.valid',
			hash: 'account.email.hash',
			dateLastReq: 'account.email.dateLastReq',
			requestTimes: 'account.email.requestTimes',
			newEmailTmp: 'account.email.newEmailTmp',
			deleted: 'account.deleted',
			disabled: 'account.disabled',
			verifyClear: ['account.email.hash', 'account.email.dateLastReq', 'account.email.requestTimes'],
			emailChangeClear: [
				'account.email.hash',
				'account.email.dateLastReq',
				'account.email.requestTimes',
				'account.email.newEmailTmp'
			]
		})
	})

	it('is frozen, including both clear lists', () => {
		expect(Object.isFrozen(DEFAULT_VERIFY_EMAIL_PATHS)).to.equal(true)
		expect(Object.isFrozen(DEFAULT_VERIFY_EMAIL_PATHS.verifyClear)).to.equal(true)
		expect(Object.isFrozen(DEFAULT_VERIFY_EMAIL_PATHS.emailChangeClear)).to.equal(true)
	})

	it('never clears the live email address or the valid flag', () => {
		for (const path of [...DEFAULT_VERIFY_EMAIL_PATHS.verifyClear, ...DEFAULT_VERIFY_EMAIL_PATHS.emailChangeClear]) {
			expect(path).to.not.equal(DEFAULT_VERIFY_EMAIL_PATHS.email)
			expect(path).to.not.equal(DEFAULT_VERIFY_EMAIL_PATHS.valid)
		}
	})
})

describe('resolveVerifyEmailPaths', () => {
	it('with no argument returns the defaults', () => {
		expect(resolveVerifyEmailPaths()).to.deep.equal({ ...DEFAULT_VERIFY_EMAIL_PATHS })
	})

	it('overrides only the keys supplied', () => {
		const resolved = resolveVerifyEmailPaths({ email: 'mail', verifyClear: ['verification'] })
		expect(resolved.email).to.equal('mail')
		expect(resolved.verifyClear).to.deep.equal(['verification'])
		expect(resolved.emailChangeClear).to.deep.equal(DEFAULT_VERIFY_EMAIL_PATHS.emailChangeClear)
		expect(resolved.hash).to.equal('account.email.hash')
	})

	it('does not return the frozen default object itself', () => {
		expect(resolveVerifyEmailPaths()).to.not.equal(DEFAULT_VERIFY_EMAIL_PATHS)
	})
})
