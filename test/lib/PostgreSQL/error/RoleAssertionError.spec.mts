import { ROLE_ASSERT_REASONS } from '@lib/PostgreSQL/error/ROLE_ASSERT_REASONS.mjs'
import { RoleAssertionError } from '@lib/PostgreSQL/error/RoleAssertionError.mjs'
import { expect } from 'chai'

import { leakText } from '../../../helpers/fakeTxPool.mjs'
import { plantedUrl } from '../../../helpers/roleFixtures.mjs'

// shape of the error: fixed message built from names that pass a shape check, no cause, no free text

describe('RoleAssertionError', () => {
	it('is an Error with the closed reason, the role and a message of the same shape for every reason', () => {
		for (const reason of ROLE_ASSERT_REASONS) {
			const error = new RoleAssertionError(reason, 'worker_role')
			expect(error).to.be.instanceOf(Error)
			expect(error.name).to.equal('RoleAssertionError')
			expect(error.reason).to.equal(reason)
			expect(error.role).to.equal('worker_role')
			expect(error.message.startsWith(`role assertion failed for worker_role: ${reason}`)).to.equal(true)
			expect(error.cause).to.equal(undefined)
		}
	})

	it('has a bare message for a reason with no subject', () => {
		expect(new RoleAssertionError('ROLE_MISMATCH', 'worker_role').message).to.equal(
			'role assertion failed for worker_role: ROLE_MISMATCH'
		)
		expect(new RoleAssertionError('ROLE_SUPERUSER', 'worker_role').message).to.equal(
			'role assertion failed for worker_role: ROLE_SUPERUSER'
		)
	})

	it('names the object, the privilege and the column of a missing grant', () => {
		const error = new RoleAssertionError('GRANT_MISSING', 'worker_role', {
			object: 'app.items',
			privilege: 'UPDATE',
			column: 'locale'
		})
		expect(error.message).to.equal('role assertion failed for worker_role: GRANT_MISSING (UPDATE on app.items column locale)')
		expect([error.object, error.privilege, error.column]).to.deep.equal(['app.items', 'UPDATE', 'locale'])
	})

	it('names a missing grant without a column', () => {
		const error = new RoleAssertionError('GRANT_MISSING', 'worker_role', { object: 'app.items', privilege: 'SELECT' })
		expect(error.message).to.equal('role assertion failed for worker_role: GRANT_MISSING (SELECT on app.items)')
		expect(error.column).to.equal(undefined)
	})

	it('says ? for a part of a missing grant that was not given', () => {
		expect(new RoleAssertionError('GRANT_MISSING', 'worker_role').message).to.equal(
			'role assertion failed for worker_role: GRANT_MISSING (? on ?)'
		)
		expect(new RoleAssertionError('GRANT_MISSING', 'worker_role', { object: 'app.items' }).message).to.equal(
			'role assertion failed for worker_role: GRANT_MISSING (? on app.items)'
		)
		expect(new RoleAssertionError('GRANT_MISSING', 'worker_role', { privilege: 'SELECT' }).message).to.equal(
			'role assertion failed for worker_role: GRANT_MISSING (SELECT on ?)'
		)
	})

	it('treats a field given as undefined like a field left out', () => {
		const error = new RoleAssertionError('GRANT_MISSING', 'worker_role', {
			object: undefined,
			privilege: undefined,
			column: undefined,
			code: undefined
		})
		expect([error.object, error.privilege, error.column, error.code]).to.deep.equal([undefined, undefined, undefined, undefined])
		expect(error.message).to.equal('role assertion failed for worker_role: GRANT_MISSING (? on ?)')
	})

	it('names the role that a membership was found in, or ? when none is given', () => {
		const error = new RoleAssertionError('ROLE_MEMBERSHIP', 'worker_role', { object: 'owner_role' })
		expect(error.message).to.equal('role assertion failed for worker_role: ROLE_MEMBERSHIP (member of owner_role)')
		expect(error.object).to.equal('owner_role')
		expect(new RoleAssertionError('ROLE_MEMBERSHIP', 'worker_role').message).to.equal(
			'role assertion failed for worker_role: ROLE_MEMBERSHIP (member of ?)'
		)
	})

	it('shows the code of a failed check only when it is a short code', () => {
		const withCode = new RoleAssertionError('CHECK_FAILED', 'worker_role', { code: '42501' })
		expect(withCode.message).to.equal('role assertion failed for worker_role: CHECK_FAILED (42501)')
		expect(withCode.code).to.equal('42501')
		expect(new RoleAssertionError('CHECK_FAILED', 'worker_role', { code: 'x'.repeat(32) }).code).to.equal('x'.repeat(32))
		expect(new RoleAssertionError('CHECK_FAILED', 'worker_role', { code: 'has spaces' }).code).to.equal(undefined)
		expect(new RoleAssertionError('CHECK_FAILED', 'worker_role', { code: '' }).code).to.equal(undefined)
		expect(new RoleAssertionError('CHECK_FAILED', 'worker_role', { code: 'x'.repeat(33) }).message).to.equal(
			'role assertion failed for worker_role: CHECK_FAILED'
		)
		expect(new RoleAssertionError('CHECK_FAILED', 'worker_role').message).to.equal(
			'role assertion failed for worker_role: CHECK_FAILED'
		)
	})

	it('keeps a code that is only letters, digits and underscores', () => {
		for (const code of ['ECONNREFUSED', '28P01', 'a_b', 'A', '0']) {
			expect(new RoleAssertionError('CHECK_FAILED', 'worker_role', { code }).code).to.equal(code)
		}
		for (const code of ['a-b', 'a.b', 'ünï', 'ok\nline', 'a$b']) {
			expect(new RoleAssertionError('CHECK_FAILED', 'worker_role', { code }).code, JSON.stringify(code)).to.equal(undefined)
		}
	})

	it('ignores a code on any other reason when it builds the message', () => {
		expect(new RoleAssertionError('ROLE_MISMATCH', 'worker_role', { code: '42501' }).message).to.equal(
			'role assertion failed for worker_role: ROLE_MISMATCH'
		)
	})

	it('prints a name that is not a plain name as ?, and never keeps the text', () => {
		const secret = plantedUrl('planted-error-secret')
		const error = new RoleAssertionError('GRANT_MISSING', secret, { object: secret, privilege: secret, column: secret })
		expect(error.role).to.equal('?')
		expect([error.object, error.privilege, error.column]).to.deep.equal(['?', '?', '?'])
		expect(leakText(error, [])).to.not.contain('planted-error-secret')
		expect(leakText(error, [])).to.not.contain('db.example.test')
	})

	it('accepts the names a catalog holds: dots, dollars, digits, up to 127 characters', () => {
		for (const name of ['a', '_a', 'app.items', 'r$1', 'A1.b2', `a${'b'.repeat(126)}`]) {
			expect(new RoleAssertionError('ROLE_MISMATCH', name).role, name).to.equal(name)
		}
	})

	it('refuses what is not a plain name: empty, a digit first, a space, a quote, a dash, 128 characters, a line break', () => {
		for (const name of ['', '1a', 'a b', 'a"b', 'a-b', 'b'.repeat(128), 'a\nb', ' a', 'a ']) {
			expect(new RoleAssertionError('ROLE_MISMATCH', name).role, JSON.stringify(name)).to.equal('?')
		}
	})

	it('prints ? for a role that is not a string at all, as a plain-JS caller could pass', () => {
		// cast: type forbids a non-string role, plain-JS caller does not
		for (const role of [undefined, null, 7, {}, ['app_role'], Symbol.for('x')]) {
			expect(new RoleAssertionError('INVALID_EXPECTATION', role as never).role).to.equal('?')
		}
	})
})
