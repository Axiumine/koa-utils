import { catalogText } from '@private/lib/PostgreSQL/catalogText.mjs'
import { expect } from 'chai'

describe('catalogText', () => {
	it('answers a string as it is, the empty one included', () => {
		expect(catalogText('app_role')).to.equal('app_role')
		expect(catalogText('')).to.equal('')
	})

	it('throws a TypeError for anything else', () => {
		for (const value of [undefined, null, 5, true, {}, ['a'], Symbol('a')]) {
			expect(() => catalogText(value), String(typeof value)).to.throw(TypeError, 'the catalog answered a value of another type')
		}
	})
})
