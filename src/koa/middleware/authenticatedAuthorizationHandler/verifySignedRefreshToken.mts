import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { throwPreconditionFailedNoAuthCookie } from '@throw/throwPreconditionFailedNoAuthCookie.mjs'
import { throwRefreshTokenRequired } from '@throw/throwRefreshTokenRequired.mjs'
import { throwRefreshTokenSignatureRequired } from '@throw/throwRefreshTokenSignatureRequired.mjs'
import { throwUnauthorizedError } from '@throw/throwUnauthorizedError.mjs'
import Keygrip from 'keygrip'

export function verifySignedRefreshToken(ctx: IContextRefresh, keys: Keygrip): string {
	// @todo must check the cookie or the header or both, and what to do if one of the two is missing ??

	const cookieHeader = ctx.request.header?.cookie

	if (cookieHeader === undefined) {
		throw throwPreconditionFailedNoAuthCookie()
	}

	// Only the two cookies this check needs are read, each into its own variable. Copying every pair into one
	// object under its client-chosen name let the request pick the property written, `constructor` included.
	let refreshToken: string | undefined
	let signature: string | undefined
	for (const cookie of cookieHeader.split(';')) {
		const [key, value] = cookie.trim().split('=')
		if (key === 'refresh_token') {
			refreshToken = value
		} else if (key === 'refresh_token.sig') {
			signature = value
		}
	}
	/**
	 * 'refresh_token=27119032-9043-4a9f-bd4c-9d06fd576290; refresh_token.sig=P1gZO6-49xVEMkiMqkOjJ2Cxaf3mQb18GaflDsjibuv4fFWYIOzcW26didnVJ1aridyY40CFzDtufzI6zI8jkQ'
	 */
	if (!refreshToken) {
		throw throwRefreshTokenRequired()
	}
	if (!signature) {
		throw throwRefreshTokenSignatureRequired()
	}

	// Verify signature
	// Verify signature with Keygrip
	const index = keys.index(`refresh_token=${refreshToken}`, signature)

	if (index === -1) {
		// Signature invalid
		throw throwUnauthorizedError('Invalid Refresh Cookie signature')
	}

	return `refresh:${refreshToken}`
}
