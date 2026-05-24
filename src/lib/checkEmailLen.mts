import { EMAIL_MAX_LEN } from '@lib/Constants.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

export function checkEmailLen(email: string) {
	if (email === '') {
		throw throwErrorWrongUserInput('L\'email non può essere vuota')
	} else if (email.length > EMAIL_MAX_LEN) {
		throw throwErrorWrongUserInput(
			`L'email non può superare i ${EMAIL_MAX_LEN} caratteri`
		)
	}
}
