/**
 * Tests for private/graphQL/schema/mutations/checkUserLoginAuthorization.mts
 *
 * Chain: checkUserLoginAuthorization → infoUserForLogin (UserBase.findOne) → _finalizeLoginCheck
 *        (bcrypt.compare + SocketLabsLib.accountDisabled)
 *
 * Exercised directly here (not only transitively through login4Ever/loginRememberme specs) so an
 * inverted branch inside infoUserForLogin or _finalizeLoginCheck cannot hide behind the full
 * mutation's session/redis/token wiring.
 */
import { checkUserLoginAuthorization } from '@private/graphQL/schema/mutations/checkUserLoginAuthorization.mjs'
import { UserBase } from '@models/MongoDB/UserBase.mjs'
import { SocketLabsLib } from '@email/SocketLabsLib.mjs'
import { ClientSession, Types } from 'mongoose'
import { expect } from 'chai'
import sinon from 'sinon'

import { expectGraphQLErrorAsync } from '../../../../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------

function makeQuery(value: unknown) {
	return {
		select: sinon.stub().returnsThis(),
		session: sinon.stub().returnsThis(),
		exec: () => Promise.resolve(value)
	}
}

function fakeUser(overrides: Partial<{ account: object; login: object }> = {}) {
	return {
		_id: new Types.ObjectId(),
		login: { password: 'hashedpwd', lastLogin: null, ...((overrides.login as object | undefined) ?? {}) },
		account: {
			email: { valid: true },
			deleted: false,
			disabled: false,
			...((overrides.account as object | undefined) ?? {})
		}
	}
}

describe('checkUserLoginAuthorization', () => {
	let findOneStub: sinon.SinonStub
	let compareStub: sinon.SinonStub
	let accountDisabledStub: sinon.SinonStub
	const session = {} as ClientSession

	beforeEach(async () => {
		findOneStub = sinon.stub(UserBase, 'findOne')
		const bcryptMod = (await import('@node-rs/bcrypt')).default
		compareStub = sinon.stub(bcryptMod, 'compare').resolves(true)
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('user not found → throws 401 Unauthorized', async () => {
		findOneStub.returns(makeQuery(null))

		await expectGraphQLErrorAsync(() => checkUserLoginAuthorization('missing@test.com', 'pwd', session), 401, 'Unauthorized')
	})

	it('email not validated → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: false }, deleted: false, disabled: false } })))

		await expectGraphQLErrorAsync(() => checkUserLoginAuthorization('u@test.com', 'pwd', session), 403, 'Forbidden')
	})

	it('wrong password → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser()))
		compareStub.resolves(false)

		await expectGraphQLErrorAsync(() => checkUserLoginAuthorization('u@test.com', 'wrong', session), 403, 'Forbidden')
	})

	it('account deleted → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: true }, deleted: true, disabled: false } })))

		await expectGraphQLErrorAsync(() => checkUserLoginAuthorization('del@test.com', 'pwd', session), 403, 'Forbidden')
	})

	it('account disabled → throws 403 Forbidden and sends accountDisabled email', async () => {
		findOneStub.returns(makeQuery(fakeUser({ account: { email: { valid: true }, deleted: false, disabled: true } })))

		await expectGraphQLErrorAsync(() => checkUserLoginAuthorization('dis@test.com', 'pwd', session), 403, 'Forbidden')
		expect(accountDisabledStub.calledOnceWith('dis@test.com')).to.equal(true)
	})

	it('valid credentials → resolves { userId, lastLogin }', async () => {
		const lastLogin = new Date('2024-01-01')
		const user = fakeUser({ login: { password: 'hashedpwd', lastLogin } })
		findOneStub.returns(makeQuery(user))

		const result = await checkUserLoginAuthorization('ok@test.com', 'pwd', session)

		expect(result).to.deep.equal({ userId: user._id, lastLogin })
	})
})
