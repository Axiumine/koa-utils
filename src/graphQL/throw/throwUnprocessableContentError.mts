import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwUnprocessableContentError = (txt: string = 'We are unable to process the instructions contained in the request.') => {
	throw throwGraphQLError(
		422,
		'Unprocessable Content',
		txt
	)
}
