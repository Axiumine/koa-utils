import { StringLib } from '@lib/StringLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

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

		it('does not draw from Math.random — reset and email hashes depend on this', () => {
			// randomString backs every password-reset hash and email-confirmation hash in
			// the package. Math.random() is V8's xorshift128+: its state is recoverable
			// from observed outputs, after which the next hash is predictable — request a
			// reset for your own account, read your hash, predict the victim's. Length
			// gives no protection; entropy is bounded by the generator.
			const spy = sinon.spy(Math, 'random')
			try {
				s.randomString(50)
				expect(spy.called, 'hashes must come from a CSPRNG, not Math.random').to.equal(false)
			} finally {
				spy.restore()
			}
		})

		it('returns an empty string for a non-positive length', () => {
			expect(s.randomString(0)).to.equal('')
			expect(s.randomString(-5)).to.equal('')
		})

		it('does not repeat across many draws', () => {
			const seen = new Set<string>()
			for (let i = 0; i < 200; i++) {
				seen.add(s.randomString(50))
			}
			expect(seen.size).to.equal(200)
		})
	})

	describe('getRandomArbitrary', () => {
		it('returns min when the range is empty or inverted', () => {
			expect(s.getRandomArbitrary(7, 7)).to.equal(7)
			expect(s.getRandomArbitrary(7, 3)).to.equal(7)
		})

		it('covers the whole range, not just the low end (no modulo bias)', () => {
			const seen = new Set<number>()
			for (let i = 0; i < 500; i++) {
				seen.add(s.getRandomArbitrary(0, 10))
			}
			// every bucket must appear — a biased or constant generator would not fill them
			expect(seen.size).to.equal(10)
		})

		it('returns integer within [min, max)', () => {
			for (let i = 0; i < 100; i++) {
				const n = s.getRandomArbitrary(5, 10)
				expect(Number.isInteger(n)).to.equal(true)
				expect(n).to.be.at.least(5)
				expect(n).to.be.lessThan(10)
			}
		})
	})

	describe('getRandomOTP — must not be predictable', () => {
		it('does not draw from Math.random', () => {
			// A predictable one-time password defeats the point of one.
			const spy = sinon.spy(Math, 'random')
			try {
				s.getRandomOTP()
				expect(spy.called, 'OTPs must come from a CSPRNG').to.equal(false)
			} finally {
				spy.restore()
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
