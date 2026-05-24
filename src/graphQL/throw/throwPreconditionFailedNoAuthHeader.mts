import { throwGraphQLError } from './throwGraphQLError.mjs'

export const throwPreconditionFailedNoAuthHeader = () => {
	throw throwGraphQLError(
		412,
		'Precondition Failed',
		'No authorization header.'
	)
}
