import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { throwPreconditionFailedNoAuthCookie } from '@throw/throwPreconditionFailedNoAuthCookie.mjs'
import { throwRefreshTokenRequired } from '@throw/throwRefreshTokenRequired.mjs'
import { throwRefreshTokenSignatureRequired } from '@throw/throwRefreshTokenSignatureRequired.mjs'
import { throwUnauthorizedError } from '@throw/throwUnauthorizedError.mjs'
import Keygrip from 'keygrip'

import { TCookieRefreshToken } from './TCookieRefreshToken.mjs'

export function verifySignedRefreshToken(ctx: IContextRefresh, keys: Keygrip): string {
	// @todo deve controllare il cookie o l'header o entrambi e cosa fare se manca uno dei due ??

	const cookieHeader = ctx.request.header?.cookie
	// console.debug('ctx.request.header', ctx.request.header)

	if (cookieHeader === undefined) {
		throw throwPreconditionFailedNoAuthCookie()
	}

	const cookies: TCookieRefreshToken = {}
	cookieHeader.split(';').forEach((cookie) => {
		const [key, value] = cookie.trim().split('=')
		// @ts-expect-error ignore wrong keys
		cookies[key] = value
	})
	/**
	 * 'refresh_token=27119032-9043-4a9f-bd4c-9d06fd576290; refresh_token.sig=P1gZO6-49xVEMkiMqkOjJ2Cxaf3mQb18GaflDsjibuv4fFWYIOzcW26didnVJ1aridyY40CFzDtufzI6zI8jkQ'
	 */
	const refreshToken = cookies?.refresh_token
	if (!refreshToken) {
		throw throwRefreshTokenRequired()
	}
	const signature = cookies?.['refresh_token.sig']
	if (!signature) {
		throw throwRefreshTokenSignatureRequired()
	}
	// console.debug('refreshToken', refreshToken)
	// console.debug('signature', signature)

	// Verify signature
	// Verify signature with Keygrip
	const index = keys.index(`refresh_token=${refreshToken}`, signature)

	if (index === -1) {
		// Signature invalid
		throw throwUnauthorizedError('Invalid Refresh Cookie signature')
	}
	// console.debug('signature OK')

	return `refresh:${refreshToken}`
}
