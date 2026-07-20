// OWASP max len 72 chr for bcrypt
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#input-limits-of-bcrypt

import { MAX_PWD_LENGTH, MIN_PWD_LENGTH } from '@lib/Constants.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

export function checkPwdLen(password: string) {
	if (password.length < MIN_PWD_LENGTH) {
		throw throwErrorWrongUserInput('Password is too short')
	} else if (password.length > MAX_PWD_LENGTH) {
		throw throwErrorWrongUserInput('Password is too long')
	}
}
