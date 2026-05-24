import { IContextLogin } from '@context/IContextLogin.mjs'
import { refreshTokenOptions } from '@lib/tokenOptions.mjs'
import { REFRESH_TOKEN_EXPIRY } from '@lib/tokens.mjs'

export function setLoginCookies(
	ctx: IContextLogin,
	refreshToken: string
) {
	ctx.cookies.set('refresh_token', refreshToken, {
		...refreshTokenOptions,
		maxAge: REFRESH_TOKEN_EXPIRY * 1000  // maxAge is in milliseconds
	})
	// if remember me, generate ?
}
