import { childOf, countOf, field, isObject, itemOf, listOf } from '@private/glb/jsonAccess.mjs'
import { expect } from 'chai'

describe('private/glb/jsonAccess', () => {
	it('isObject accepts a plain object only', () => {
		expect(isObject({})).to.equal(true)
		expect(isObject({ a: 1 })).to.equal(true)
		for (const value of [null, undefined, [], [1], 'x', 5, true]) {
			expect(isObject(value), String(value)).to.equal(false)
		}
	})

	it('listOf returns an array as is and anything else as an empty list', () => {
		const list = [1, 2]
		expect(listOf(list)).to.equal(list)
		for (const value of [undefined, null, {}, 'ab', 3]) {
			expect(listOf(value)).to.deep.equal([])
		}
	})

	it('countOf keeps a safe non-negative integer and maps everything else to 0', () => {
		expect(countOf(7)).to.equal(7)
		expect(countOf(0)).to.equal(0)
		expect(countOf(Number.MAX_SAFE_INTEGER)).to.equal(Number.MAX_SAFE_INTEGER)
		for (const value of [-1, -0.5, 1.5, NaN, Infinity, 2 ** 53, '5', null, undefined, {}, [5]]) {
			expect(countOf(value), String(value)).to.equal(0)
		}
	})

	it('field reads own properties only, never the prototype', () => {
		const object: Record<string, unknown> = { a: 1, undef: undefined }
		expect(field(object, 'a')).to.equal(1)
		expect(field(object, 'missing')).to.equal(undefined)
		for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
			expect(field(object, key), key).to.equal(undefined)
		}
		// JSON.parse makes __proto__ an own key
		const parsed = JSON.parse('{"__proto__": 5}') as Record<string, unknown>
		expect(field(parsed, '__proto__')).to.equal(5)
	})

	it('itemOf returns the object at a valid position and an empty object otherwise', () => {
		const list: unknown[] = [{ a: 1 }, 'text', { b: 2 }]
		expect(itemOf(list, 0)).to.deep.equal({ a: 1 })
		expect(itemOf(list, 2)).to.deep.equal({ b: 2 })
		expect(itemOf(list, 1)).to.deep.equal({})
		expect(itemOf(list, 3)).to.deep.equal({})
		// negative → at() would count from the end
		expect(itemOf(list, -1)).to.deep.equal({})
		// string index → at() would coerce it
		expect(itemOf(list, '0')).to.deep.equal({})
		expect(itemOf(list, undefined)).to.deep.equal({})
		expect(itemOf(list, 1e300)).to.deep.equal({})
	})

	it('childOf returns the child object or an empty one', () => {
		expect(childOf({ a: { b: 1 } }, 'a')).to.deep.equal({ b: 1 })
		expect(childOf({ a: [1] }, 'a')).to.deep.equal({})
		expect(childOf({ a: 5 }, 'a')).to.deep.equal({})
		expect(childOf({}, 'a')).to.deep.equal({})
	})
})
