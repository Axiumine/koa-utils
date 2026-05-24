import { throwGraphQLError } from '@throw/throwGraphQLError.mjs'

export const throwAlreadyTakenError = (
	desc: string = 'You have already done this.'
) => {
	// es. invio email a chi l'ha già ricevuta
	throw throwGraphQLError(409, 'Conflict', desc)
}
