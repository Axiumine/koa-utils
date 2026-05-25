import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwRefreshTokenExpiredOrDeleted = () => {
	throw throwGraphQLError(498, 'Invalid Token', 'Refresh Token is expired or deleted by Admin.')
}
