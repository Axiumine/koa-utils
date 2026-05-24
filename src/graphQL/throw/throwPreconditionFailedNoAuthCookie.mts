import { throwGraphQLError } from './throwGraphQLError.mjs'

export const throwPreconditionFailedNoAuthCookie = () => {
	throw throwGraphQLError(
		412,
		'Precondition Failed',
		'No authorization cookie.'
	)
}
