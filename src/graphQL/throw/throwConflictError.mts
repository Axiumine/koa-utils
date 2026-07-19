import { throwAlreadyTakenError } from '@throw/throwAlreadyTakenError.mjs'

export const throwConflictError = (desc: string = 'You have already done this.') => {
	// e.g. sending an email to someone who has already received it
	throw throwAlreadyTakenError(desc)
}
