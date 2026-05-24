import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwUnauthorizedError = (text: string = 'You are unauthorized.') => {
	throw throwGraphQLError(401, 'Unauthorized', text)
}
