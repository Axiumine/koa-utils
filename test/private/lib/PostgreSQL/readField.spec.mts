import { readField } from '@private/lib/PostgreSQL/readField.mjs'
import { expect } from 'chai'

describe('readField', () => {
	it('reads a property of an object', () => {
		expect(readField({ code: '23505' }, 'code')).to.equal('23505')
		expect(readField(new Error('x'), 'message')).to.equal('x')
		expect(readField({}, 'code')).to.equal(undefined)
	})

	it('answers undefined for null and every primitive', () => {
		for (const value of [null, undefined, 'text', 42, true, Symbol('s'), 10n]) {
			expect(readField(value, 'length')).to.equal(undefined)
		}
	})

	it('answers undefined for a function: only objects are read', () => {
		// fn has own props (name, length) → would leak if typeof 'function' allowed
		expect(readField(() => undefined, 'length')).to.equal(undefined)
	})

	it('reads through the prototype chain, like a plain property access', () => {
		class Base {
			code = 'from-instance'
		}
		expect(readField(new Base(), 'code')).to.equal('from-instance')
		expect(readField(Object.create({ code: 'inherited' }), 'code')).to.equal('inherited')
	})
})
