import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwAccessTokenExpiredOrDeleted = () => {
	throw throwGraphQLError(498, 'Invalid Token', 'Access Token is expired or deleted by Admin.')
}
