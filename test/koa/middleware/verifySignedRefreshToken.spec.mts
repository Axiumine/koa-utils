import { expect } from 'chai'
import Keygrip from 'keygrip'

import { verifySignedRefreshToken } from '../../../dist/koa/middleware/authenticatedAuthorizationHandler/verifySignedRefreshToken.mjs'
import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'

describe('verifySignedRefreshToken', () => {
	const keys = new Keygrip(['k1'])
	const token = '27119032-9043-4a9f-bd4c-9d06fd576290'
	const sig = keys.sign(`refresh_token=${token}`)

	const makeCtx = (cookie?: string) => ({
		request: { header: cookie !== undefined ? { cookie } : {} }
	}) as never

	it('returns refresh:<uuid> (prefix already included) for valid cookie + signature', () => {
		const ctx = makeCtx(`refresh_token=${token}; refresh_token.sig=${sig}`)
		expect(verifySignedRefreshToken(ctx, keys)).to.equal(`refresh:${token}`)
	})

	it('throws 412 Precondition Failed when no cookie header at all', () => {
		expectGraphQLError(
			() => verifySignedRefreshToken(makeCtx(), keys),
			412,
			'Precondition Failed',
			'No authorization cookie.'
		)
	})

	it('throws 499 Token Required when refresh_token cookie missing', () => {
		expectGraphQLError(
			() => verifySignedRefreshToken(makeCtx('other=val'), keys),
			499,
			'Token Required',
			'Refresh Token Required.'
		)
	})

	it('throws 499 Signature Required when sig cookie missing', () => {
		expectGraphQLError(
			() => verifySignedRefreshToken(makeCtx(`refresh_token=${token}`), keys),
			499,
			'Token Required',
			'Refresh Token Signature Required.'
		)
	})

	it('throws 401 Unauthorized when signature does not match', () => {
		expectGraphQLError(
			() =>
				verifySignedRefreshToken(
					makeCtx(`refresh_token=${token}; refresh_token.sig=BOGUS`),
					keys
				),
			401,
			'Unauthorized',
			'Invalid Refresh Cookie signature'
		)
	})
})
