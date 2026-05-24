import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwErrorWrongUserInput = (message: string) => {
	throw throwGraphQLError(400, 'Bad Request', message)
}
