import { throwIfNotValidEnumValue } from '@lib/throwIfNotValidEnumValue.mjs'
import { expect } from 'chai'

import { expectGraphQLError } from '../helpers/assertGraphQLError.mjs'

enum Color {
	red = 'red',
	blue = 'blue'
}

enum Code {
	one = 1,
	two = 2
}

describe('throwIfNotValidEnumValue', () => {
	it('passes when value is a string-enum member', () => {
		expect(() => throwIfNotValidEnumValue(Color, 'red')).to.not.throw()
	})

	it('passes when value is a numeric-enum member', () => {
		expect(() => throwIfNotValidEnumValue(Code, 1)).to.not.throw()
	})

	it('throws 400 when value missing from enum', () => {
		expectGraphQLError(
			() => throwIfNotValidEnumValue(Color, 'green'),
			400,
			'Bad Request',
			'Wrong enum value'
		)
	})

	it('throws on boolean (not in enum)', () => {
		expectGraphQLError(
			() => throwIfNotValidEnumValue(Color, true),
			400,
			'Bad Request',
			'Wrong enum value'
		)
	})
})
