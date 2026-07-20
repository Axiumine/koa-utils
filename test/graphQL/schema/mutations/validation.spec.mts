import { login4Ever } from '../../../../dist/graphQL/schema/mutations/login4Ever.mjs'
import { loginAdmin } from '../../../../dist/graphQL/schema/mutations/loginAdmin.mjs'
import { loginRememberme } from '../../../../dist/graphQL/schema/mutations/loginRememberme.mjs'
import { resetPwd } from '../../../../dist/graphQL/schema/mutations/resetPwd.mjs'
import { signUp } from '../../../../dist/graphQL/schema/mutations/signUp.mjs'
import { updatePassword } from '../../../../dist/graphQL/schema/mutations/updatePassword.mjs'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'

// All these resolvers run `checkEmailLen` / `checkPwdLen` BEFORE startSession,
// so we can drive them with a stub ctx and assert the synchronous validation throw.
const stubCtx = { cookies: { set: () => undefined } } as never

describe('mutations — early input validation (before mongoose.startSession)', () => {
	describe('signUp', () => {
		it('throws 400 when email empty', async () => {
			await expectGraphQLErrorAsync(
				() => signUp.resolve(null, { email: '', password: 'x'.repeat(12) }),
				400,
				'Bad Request',
				'Email cannot be empty'
			)
		})
		it('throws 400 when password too short', async () => {
			await expectGraphQLErrorAsync(
				() => signUp.resolve(null, { email: 'a@b.it', password: 'short' }),
				400,
				'Bad Request',
				'Password is too short'
			)
		})
		it('throws 400 when password too long', async () => {
			await expectGraphQLErrorAsync(
				() => signUp.resolve(null, { email: 'a@b.it', password: 'x'.repeat(73) }),
				400,
				'Bad Request',
				'Password is too long'
			)
		})
	})

	describe('login4Ever', () => {
		it('throws 400 on empty email', async () => {
			await expectGraphQLErrorAsync(
				() => login4Ever.resolve(null, { email: '', password: 'x'.repeat(12) }, stubCtx),
				400,
				'Bad Request'
			)
		})
		it('throws 400 on short pwd', async () => {
			await expectGraphQLErrorAsync(
				() => login4Ever.resolve(null, { email: 'a@b.it', password: '1' }, stubCtx),
				400,
				'Bad Request'
			)
		})
	})

	describe('loginAdmin', () => {
		it('throws 400 on empty email', async () => {
			await expectGraphQLErrorAsync(
				() =>
					loginAdmin.resolve(
						null,
						{ email: '', password: 'x'.repeat(12), rememberMe: false },
						stubCtx
					),
				400,
				'Bad Request'
			)
		})
	})

	describe('loginRememberme', () => {
		it('throws 400 on empty email', async () => {
			await expectGraphQLErrorAsync(
				() =>
					loginRememberme.resolve(
						null,
						{ email: '', password: 'x'.repeat(12), rememberMe: true },
						stubCtx
					),
				400,
				'Bad Request'
			)
		})
	})

	describe('resetPwd', () => {
		it('throws 400 on empty email (before session)', async () => {
			await expectGraphQLErrorAsync(
				() => resetPwd.resolve(null, { email: '' }),
				400,
				'Bad Request'
			)
		})
	})

	describe('updatePassword', () => {
		it('throws 400 on empty email', async () => {
			await expectGraphQLErrorAsync(
				() =>
					updatePassword.resolve(null, {
						email: '',
						hash: 'h',
						password: 'x'.repeat(12)
					}),
				400,
				'Bad Request'
			)
		})
		it('throws 400 on short pwd', async () => {
			await expectGraphQLErrorAsync(
				() =>
					updatePassword.resolve(null, {
						email: 'a@b.it',
						hash: 'h',
						password: '1'
					}),
				400,
				'Bad Request'
			)
		})
	})
})
