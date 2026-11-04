import { errorNameOf } from '@lib/PostgreSQL/error/errorNameOf.mjs'
import { expect } from 'chai'

describe('errorNameOf', () => {
	it('answers the class name when it is a plain identifier', () => {
		expect(errorNameOf(new TypeError('x'))).to.equal('TypeError')
		expect(errorNameOf({ name: 'SomeCustomError' })).to.equal('SomeCustomError')
		expect(errorNameOf({ name: 'E' })).to.equal('E')
		expect(errorNameOf({ name: `A${'b'.repeat(39)}` })).to.equal(`A${'b'.repeat(39)}`)
	})

	it('answers undefined otherwise, never the message', () => {
		const refused: unknown[] = [
			undefined,
			null,
			'TypeError',
			{},
			{ name: 5 },
			{ name: '' },
			{ name: '9lives' },
			{ name: '_lead' },
			{ name: 'has space' },
			{ name: 'a'.repeat(41) },
			{ message: 'only a message' },
			// anchors
			{ name: ' Ok' },
			{ name: 'Ok ' }
		]
		for (const value of refused) expect(errorNameOf(value), JSON.stringify(value)).to.equal(undefined)
	})
})
