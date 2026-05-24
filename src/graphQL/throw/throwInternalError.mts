import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwInternalError = (desc: string = '') => {
	throw throwGraphQLError(
		500,
		'Internal Server Error',
		`Error reported to Dev Team.${desc}`
	)
}
