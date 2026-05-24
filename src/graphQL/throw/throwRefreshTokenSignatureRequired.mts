import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwRefreshTokenSignatureRequired = () => {
	throw throwGraphQLError(499, 'Token Required', 'Refresh Token Signature Required.')
}
