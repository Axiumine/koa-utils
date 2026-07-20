/**
 * Tests for private/graphQL/schema/mutations/checkUserAdminLoginAuthorization.mts
 *
 * Chain: checkUserAdminLoginAuthorization → infoUserAdminForLogin (UserAdminKoaUtils.findOne)
 *        → _finalizeLoginCheck (bcrypt.compare + SocketLabsLib.accountDisabled)
 *
 * Exercised directly here (not only transitively through loginAdmin.spec.mts) so an inverted
 * branch inside infoUserAdminForLogin or _finalizeLoginCheck cannot hide behind the full
 * mutation's session/redis/token wiring.
 */
import { checkUserAdminLoginAuthorization } from '@private/graphQL/schema/mutations/checkUserAdminLoginAuthorization.mjs'
import UserAdminKoaUtils from '@private/graphQL/models/MongoDB/private/UserAdminKoaUtils.mjs'
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

function fakeAdminUser(overrides: Partial<{ account: object; login: object }> = {}) {
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

describe('checkUserAdminLoginAuthorization', () => {
	let findOneStub: sinon.SinonStub
	let compareStub: sinon.SinonStub
	let accountDisabledStub: sinon.SinonStub
	const session = {} as ClientSession

	beforeEach(async () => {
		findOneStub = sinon.stub(UserAdminKoaUtils, 'findOne')
		const bcryptMod = (await import('@node-rs/bcrypt')).default
		compareStub = sinon.stub(bcryptMod, 'compare').resolves(true)
		accountDisabledStub = sinon.stub(SocketLabsLib.prototype, 'accountDisabled').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('admin not found → throws 401 Unauthorized', async () => {
		findOneStub.returns(makeQuery(null))

		await expectGraphQLErrorAsync(
			() => checkUserAdminLoginAuthorization('missing@test.com', 'pwd', session),
			401,
			'Unauthorized'
		)
	})

	it('email not validated → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ account: { email: { valid: false }, deleted: false, disabled: false } })))

		await expectGraphQLErrorAsync(() => checkUserAdminLoginAuthorization('a@test.com', 'pwd', session), 403, 'Forbidden')
	})

	it('wrong password → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser()))
		compareStub.resolves(false)

		await expectGraphQLErrorAsync(() => checkUserAdminLoginAuthorization('a@test.com', 'wrong', session), 403, 'Forbidden')
	})

	it('account deleted → throws 403 Forbidden', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ account: { email: { valid: true }, deleted: true, disabled: false } })))

		await expectGraphQLErrorAsync(() => checkUserAdminLoginAuthorization('del@test.com', 'pwd', session), 403, 'Forbidden')
	})

	it('account disabled → throws 403 Forbidden and sends accountDisabled email', async () => {
		findOneStub.returns(makeQuery(fakeAdminUser({ account: { email: { valid: true }, deleted: false, disabled: true } })))

		await expectGraphQLErrorAsync(() => checkUserAdminLoginAuthorization('dis@test.com', 'pwd', session), 403, 'Forbidden')
		expect(accountDisabledStub.calledOnceWith('dis@test.com')).to.equal(true)
	})

	it('valid credentials → resolves { userId, lastLogin }', async () => {
		const lastLogin = new Date('2024-01-01')
		const user = fakeAdminUser({ login: { password: 'hashedpwd', lastLogin } })
		findOneStub.returns(makeQuery(user))

		const result = await checkUserAdminLoginAuthorization('ok@test.com', 'pwd', session)

		expect(result).to.deep.equal({ userId: user._id, lastLogin })
	})
})
