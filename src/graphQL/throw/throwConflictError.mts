import { throwAlreadyTakenError } from '@throw/throwAlreadyTakenError.mjs'

export const throwConflictError = (desc: string = 'You have already done this.') => {
	// es. invio email a chi l'ha già ricevuta
	throw throwAlreadyTakenError(desc)
}
