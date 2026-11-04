import { versionText } from '@private/lib/PostgreSQL/versionText.mjs'
import { expect } from 'chai'

describe('versionText', () => {
	it('answers the text of a safe integer', () => {
		expect(versionText(0)).to.equal('0')
		expect(versionText(3)).to.equal('3')
		expect(versionText(-2)).to.equal('-2')
		expect(versionText(Number.MAX_SAFE_INTEGER)).to.equal('9007199254740991')
	})

	it('answers undefined for a number that is no safe integer', () => {
		for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 2 ** 60]) {
			expect(versionText(value), String(value)).to.equal(undefined)
		}
	})

	it('answers a string of 1 to 19 digits as it is, leading zeros kept', () => {
		expect(versionText('4')).to.equal('4')
		expect(versionText('007')).to.equal('007')
		expect(versionText('9007199254740993')).to.equal('9007199254740993')
		expect(versionText('1234567890123456789')).to.equal('1234567890123456789')
	})

	it('answers undefined for any other string', () => {
		for (const value of ['', '12345678901234567890', '-4', '+4', '4 ', ' 4', '4\n', '1.5', '1e3', 'four', '١٢٣']) {
			expect(versionText(value), JSON.stringify(value)).to.equal(undefined)
		}
	})

	it('answers undefined for every other type', () => {
		for (const value of [undefined, null, true, 10n, {}, [], ['4'], () => 4, Symbol('4')]) {
			expect(versionText(value)).to.equal(undefined)
		}
	})
})
