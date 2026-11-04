import { isRoleName } from '@private/lib/PostgreSQL/isRoleName.mjs'
import { expect } from 'chai'

describe('isRoleName', () => {
	it('accepts a plain identifier: a letter or underscore, then letters, digits, underscore or dollar', () => {
		for (const name of ['a', 'Z', '_', '_a', 'app_role', 'R1', 'r$1', 'a$', 'a_$_1', 'ABC123']) {
			expect(isRoleName(name), name).to.equal(true)
		}
	})

	it('accepts up to 63 characters and refuses 64', () => {
		expect(isRoleName('a'.repeat(63))).to.equal(true)
		expect(isRoleName('a'.repeat(64))).to.equal(false)
		expect(isRoleName(`_${'9'.repeat(62)}`)).to.equal(true)
		expect(isRoleName(`_${'9'.repeat(63)}`)).to.equal(false)
	})

	it('refuses what starts wrong: empty, a digit, a dollar, a dot, a space', () => {
		for (const name of ['', '1a', '$a', '.a', ' a']) expect(isRoleName(name), JSON.stringify(name)).to.equal(false)
	})

	it('refuses every character that is not letter, digit, underscore or dollar', () => {
		for (const name of ['a.b', 'a b', 'a-b', 'a"b', "a'b", 'a;b', 'a\nb', 'aé', 'a/b', 'a\\b', 'a,b', 'a ', 'a\0']) {
			expect(isRoleName(name), JSON.stringify(name)).to.equal(false)
		}
	})

	it('matches the whole text, not a part of it', () => {
		expect(isRoleName('ok name')).to.equal(false)
		expect(isRoleName('ok\n')).to.equal(false)
		expect(isRoleName('\nok')).to.equal(false)
	})

	it('refuses everything that is not a string', () => {
		for (const value of [undefined, null, 5, true, {}, ['a'], Symbol('a'), () => 'a', 10n])
			expect(isRoleName(value)).to.equal(false)
	})
})
