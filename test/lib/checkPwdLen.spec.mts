import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { MAX_PWD_LENGTH, MIN_PWD_LENGTH } from '@lib/Constants.mjs'
import { expect } from 'chai'

import { expectGraphQLError } from '../helpers/assertGraphQLError.mjs'

describe('checkPwdLen', () => {
	it('throws 400 when shorter than MIN_PWD_LENGTH', () => {
		expectGraphQLError(
			() => checkPwdLen('x'.repeat(MIN_PWD_LENGTH - 1)),
			400,
			'Bad Request',
			'Password is too short'
		)
	})

	it('throws 400 when longer than MAX_PWD_LENGTH', () => {
		expectGraphQLError(
			() => checkPwdLen('x'.repeat(MAX_PWD_LENGTH + 1)),
			400,
			'Bad Request',
			'Password is too long'
		)
	})

	it('accepts length at boundaries (min and max)', () => {
		expect(() => checkPwdLen('x'.repeat(MIN_PWD_LENGTH))).to.not.throw()
		expect(() => checkPwdLen('x'.repeat(MAX_PWD_LENGTH))).to.not.throw()
	})
})
