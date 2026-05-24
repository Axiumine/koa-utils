import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwMissingMalformedInvalidToken = () => {
	throw throwGraphQLError(
		499,
		'Token Required',
		'Missing/malformed/invalid token.'
	)
}
