import { StringLib } from '@lib/StringLib.mjs'
import { expect } from 'chai'

describe('StringLib', () => {
	const s = new StringLib()

	describe('cleanHtml', () => {
		it('strips tags', () => {
			expect(s.cleanHtml('<p>hello <b>world</b></p>')).to.equal('hello world')
		})
		it('returns empty for tag-only input', () => {
			expect(s.cleanHtml('<br/>')).to.equal('')
		})
		it('leaves plain text untouched', () => {
			expect(s.cleanHtml('plain')).to.equal('plain')
		})
	})

	describe('cleanHtmlUndefined', () => {
		it('returns undefined when input undefined', () => {
			expect(s.cleanHtmlUndefined(undefined)).to.equal(undefined)
		})
		it('strips tags when defined', () => {
			expect(s.cleanHtmlUndefined('<i>x</i>')).to.equal('x')
		})
	})

	describe('randomString', () => {
		it('returns string of requested length', () => {
			expect(s.randomString(10)).to.have.lengthOf(10)
			expect(s.randomString(50)).to.have.lengthOf(50)
		})
		it('returns alphanumeric chars (base36)', () => {
			expect(s.randomString(40)).to.match(/^[0-9a-z]+$/)
		})
	})

	describe('getRandomArbitrary', () => {
		it('returns integer within [min, max)', () => {
			for (let i = 0; i < 100; i++) {
				const n = s.getRandomArbitrary(5, 10)
				expect(Number.isInteger(n)).to.equal(true)
				expect(n).to.be.at.least(5)
				expect(n).to.be.lessThan(10)
			}
		})
	})

	describe('getRandomOTP', () => {
		it('returns 6-digit string', () => {
			for (let i = 0; i < 50; i++) {
				const otp = s.getRandomOTP()
				expect(otp).to.match(/^\d{6}$/)
			}
		})
	})

	describe('isoToTimestamp', () => {
		it('returns numeric timestamp', () => {
			const d = new Date('2024-01-01T00:00:00Z')
			expect(s.isoToTimestamp(d)).to.equal(d.getTime())
		})
	})

	describe('isoFormatDMY', () => {
		it('formats date as D/M/Y in UTC', () => {
			expect(s.isoFormatDMY('2024-03-05T12:00:00Z')).to.equal('5/3/2024')
		})
	})

	describe('isoFormatDateTime', () => {
		it('zero-pads minutes and seconds < 10', () => {
			const d = new Date()
			d.setMinutes(5)
			d.setSeconds(7)
			const out = s.isoFormatDateTime(d.toISOString())
			expect(out).to.match(/:0\d:0\d$/)
		})
		it('does not zero-pad minutes and seconds >= 10 (covers "" branch)', () => {
			// use a fixed ISO string: 2024-01-15T14:25:45.000Z
			const out = s.isoFormatDateTime('2024-01-15T14:25:45.000Z')
			// minutes=25 and seconds=45 — no leading zero
			expect(out).to.match(/:\d{2}:\d{2}$/)
			expect(out).not.to.match(/:0\d/)
		})
	})

	describe('makeLink', () => {
		it('uses link as text when text empty', () => {
			expect(s.makeLink('https://x')).to.equal(
				"<a target='_blank' href='https://x'>https://x</a>"
			)
		})
		it('uses provided text when given', () => {
			expect(s.makeLink('https://x', 'Y')).to.equal(
				"<a target='_blank' href='https://x'>Y</a>"
			)
		})
	})
})
