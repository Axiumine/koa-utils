import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

/**
 * this status code do not allow body content
 */
export const throwAlreadyDone = () => {
	throw throwGraphQLError(204, '', '')
}
