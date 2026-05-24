import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwRefreshTokenRequired = () => {
	throw throwGraphQLError(499, 'Token Required', 'Refresh Token Required.')
}
