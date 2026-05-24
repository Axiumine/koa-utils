import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwForbiddenError = () => {
	throw throwGraphQLError(403, 'Forbidden', 'Forbidden.')
}
