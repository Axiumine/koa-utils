import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwTooManyRequestsError = (desc: string = '') => {
	throw throwGraphQLError(429, 'Too Many Requests', desc)
}
