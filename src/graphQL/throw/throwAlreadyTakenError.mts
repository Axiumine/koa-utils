import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwAlreadyTakenError = (desc: string = 'You have already done this.') => {
	// e.g. sending an email to someone who already received it
	throw throwGraphQLError(409, 'Conflict', desc)
}
