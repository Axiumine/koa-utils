/**
 * Tests for private/graphQL/schema/mutations/_finalizeLoginCheck.mts
 *
 * Chain: _finalizeLoginCheck → compareHashAsync (bcrypt.compare) → throwForbiddenError on any of
 *        {invalid email, wrong password, deleted, disabled}. On disabled it also sends the
 *        accountDisabled email via SocketLabsLib before throwing.
 *
 * bcrypt.compare is stubbed via the `@node-rs/bcrypt` default export (same technique as
 * login4Ever.spec.mts) — compareHashAsync itself is a plain function export and cannot be
 * stubbed directly.
 */
import { _finalizeLoginCheck, ILoginUserShape } from '@private/graphQL/schema/mutations/_finalizeLoginCheck.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { Types } from 'mongoose'
import { expect } from 'chai'
import sinon from 'sinon'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

function fakeUser(overrides: Partial<{ account: object; login: object }> = {}): ILoginUserShape {
	return {
		_id: new Types.ObjectId(),
		login: { password: 'hashedpwd', lastLogin: undefined, ...((overrides.login as object | undefined) ?? {}) },
		account: {
			email: { valid: true },
			deleted: false,
			disabled: false,
			...((overrides.account as object | undefined) ?? {})
		}
	} as ILoginUserShape
}

describe('_finalizeLoginCheck', () => {
	let compareStub: sinon.SinonStub
	let accountDisabledStub: sinon.SinonStub

	beforeEach(async () => {
		const bcryptMod = (await import('@node-rs/bcrypt')).default
		compareStub = sinon.stub(bcryptMod, 'compare').resolves(true)
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('email not validated → throws 403 Forbidden without comparing the password', async () => {
		const user = fakeUser({ account: { email: { valid: false }, deleted: false, disabled: false } })

		await expectGraphQLErrorAsync(() => _finalizeLoginCheck(user, 'u@test.com', 'pwd'), 403, 'Forbidden')

		expect(compareStub.called).to.equal(false)
	})

	it('wrong password → throws 403 Forbidden', async () => {
		compareStub.resolves(false)
		const user = fakeUser()

		await expectGraphQLErrorAsync(() => _finalizeLoginCheck(user, 'u@test.com', 'wrong'), 403, 'Forbidden')
	})

	it('account deleted → throws 403 Forbidden', async () => {
		const user = fakeUser({ account: { email: { valid: true }, deleted: true, disabled: false } })

		await expectGraphQLErrorAsync(() => _finalizeLoginCheck(user, 'del@test.com', 'pwd'), 403, 'Forbidden')
	})

	it('account disabled → throws 403 Forbidden and sends the accountDisabled email', async () => {
		const user = fakeUser({ account: { email: { valid: true }, deleted: false, disabled: true } })

		await expectGraphQLErrorAsync(() => _finalizeLoginCheck(user, 'dis@test.com', 'pwd'), 403, 'Forbidden')

		expect(accountDisabledStub.calledOnceWith('dis@test.com')).to.equal(true)
	})

	it('valid credentials with an existing lastLogin → resolves { userId, lastLogin }', async () => {
		const lastLogin = new Date('2024-01-01')
		const user = fakeUser({ login: { password: 'hashedpwd', lastLogin } })

		const result = await _finalizeLoginCheck(user, 'ok@test.com', 'pwd')

		expect(result).to.deep.equal({ userId: user._id, lastLogin })
	})

	it('valid credentials with no lastLogin → falls back to null via ??', async () => {
		const user = fakeUser({ login: { password: 'hashedpwd', lastLogin: undefined } })

		const result = await _finalizeLoginCheck(user, 'first@test.com', 'pwd')

		expect(result).to.deep.equal({ userId: user._id, lastLogin: null })
	})
})
