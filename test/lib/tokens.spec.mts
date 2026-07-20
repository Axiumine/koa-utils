import {
	accessTokenExpiry,
	generateAccessToken,
	generateRefreshToken,
	REFRESH_TOKEN_EXPIRY
} from '@lib/tokens.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('tokens', () => {
	it('REFRESH_TOKEN_EXPIRY = 90 days in seconds', () => {
		expect(REFRESH_TOKEN_EXPIRY).to.equal(90 * 24 * 60 * 60)
	})

	it('generateAccessToken returns uuid v4', () => {
		expect(generateAccessToken()).to.match(UUID_V4_RE)
	})

	it('generateRefreshToken returns uuid v4', () => {
		expect(generateRefreshToken()).to.match(UUID_V4_RE)
	})

	it('access + refresh tokens are unique across calls', () => {
		const a = generateAccessToken()
		const b = generateAccessToken()
		const c = generateRefreshToken()
		expect(a).to.not.equal(b)
		expect(a).to.not.equal(c)
	})

	describe('accessTokenExpiry', () => {
		it('returns integer in [30*60, 91*60) seconds (src jitter range)', () => {
			for (let i = 0; i < 500; i++) {
				const v = accessTokenExpiry()
				expect(Number.isInteger(v)).to.equal(true)
				expect(v).to.be.at.least(30 * 60)
				expect(v).to.be.lessThan(91 * 60)
			}
		})

		it('is randomized (does not return constant) — CLAUDE.md guard', () => {
			const seen = new Set<number>()
			for (let i = 0; i < 50; i++) seen.add(accessTokenExpiry())
			expect(seen.size).to.be.greaterThan(1)
		})
	})

	it('does not draw token material from Math.random', () => {
		// Format + pairwise-inequality assertions cannot tell a crypto RNG from a
		// hand-rolled Math.random() v4: the latter can satisfy both. Math.random is a
		// plain object property (unlike the sealed ESM namespaces), so it can be spied.
		// accessTokenExpiry() legitimately uses Math.random for jitter — only the token
		// generators are asserted here.
		const spy = sinon.spy(Math, 'random')
		try {
			generateAccessToken()
			generateRefreshToken()
			expect(spy.called, 'tokens must come from a CSPRNG, not Math.random').to.equal(false)
		} finally {
			spy.restore()
		}
	})
})
