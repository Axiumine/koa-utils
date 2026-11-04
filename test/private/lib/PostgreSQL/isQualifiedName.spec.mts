import { isQualifiedName } from '@private/lib/PostgreSQL/isQualifiedName.mjs'
import { expect } from 'chai'

describe('isQualifiedName', () => {
	it('accepts two plain identifiers joined by one dot', () => {
		for (const name of ['a.b', 'app.orders', '_a._b', 'A1.b2', 's$.t$', 's_1.t$2'])
			expect(isQualifiedName(name), name).to.equal(true)
	})

	it('accepts 63 characters in each part and refuses 64 in either', () => {
		const max = 'a'.repeat(63)
		expect(isQualifiedName(`${max}.${max}`)).to.equal(true)
		expect(isQualifiedName(`${max}a.${max}`)).to.equal(false)
		expect(isQualifiedName(`${max}.${max}a`)).to.equal(false)
	})

	it('refuses a name with no dot, with two dots, or with an empty part', () => {
		for (const name of ['app', 'a.b.c', '.b', 'a.', '.', '..', 'a..b']) expect(isQualifiedName(name), name).to.equal(false)
	})

	it('refuses a part that starts with a digit or a dollar', () => {
		for (const name of ['1a.b', 'a.1b', '$a.b', 'a.$b']) expect(isQualifiedName(name), name).to.equal(false)
	})

	it('refuses quotes, spaces, dashes and line breaks', () => {
		for (const name of ['app."orders"', 'a b.c', 'a.b c', 'a-b.c', 'a.b-c', 'a.b\n', '\na.b', ' a.b', 'a.b ', 'a;.b']) {
			expect(isQualifiedName(name), JSON.stringify(name)).to.equal(false)
		}
	})

	it('refuses everything that is not a string', () => {
		for (const value of [undefined, null, 5, {}, ['a.b'], Symbol('a.b')]) expect(isQualifiedName(value)).to.equal(false)
	})
})
