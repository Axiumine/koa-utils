import { EMAIL_MAX_LEN } from '@lib/Constants.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

export function checkEmailLen(email: string) {
	if (email === '') {
		throw throwErrorWrongUserInput('Email cannot be empty')
	} else if (email.length > EMAIL_MAX_LEN) {
		throw throwErrorWrongUserInput(`Email cannot exceed ${EMAIL_MAX_LEN} characters`)
	}
}
