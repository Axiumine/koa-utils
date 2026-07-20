import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { EMAIL_MAX_LEN } from '@lib/Constants.mjs'
import { expect } from 'chai'

import { expectGraphQLError } from '../helpers/assertGraphQLError.mjs'

describe('checkEmailLen', () => {
	it('does not throw for normal email', () => {
		expect(() => checkEmailLen('a@b.it')).to.not.throw()
	})

	it('throws 400 Bad Request when empty', () => {
		expectGraphQLError(
			() => checkEmailLen(''),
			400,
			'Bad Request',
			'Email cannot be empty'
		)
	})

	it('throws 400 when length > EMAIL_MAX_LEN', () => {
		const long = 'a'.repeat(EMAIL_MAX_LEN + 1)
		expectGraphQLError(
			() => checkEmailLen(long),
			400,
			'Bad Request',
			`Email cannot exceed ${EMAIL_MAX_LEN} characters`
		)
	})

	it('does not throw at exactly EMAIL_MAX_LEN', () => {
		expect(() => checkEmailLen('a'.repeat(EMAIL_MAX_LEN))).to.not.throw()
	})
})
