import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwAccessTokenRequired = () => {
	throw throwGraphQLError(499, 'Token Required', 'Access Token Required.')
}
