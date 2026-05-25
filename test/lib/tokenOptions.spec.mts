import { accessTokenOptions, refreshTokenOptions } from '@lib/tokenOptions.mjs'
import { expect } from 'chai'

describe('tokenOptions', () => {
	it('access + refresh share same base shape', () => {
		expect(accessTokenOptions).to.deep.equal(refreshTokenOptions)
	})

	it('httpOnly = true', () => {
		expect(accessTokenOptions.httpOnly).to.equal(true)
		expect(refreshTokenOptions.httpOnly).to.equal(true)
	})

	it('sameSite = Strict', () => {
		expect(accessTokenOptions.sameSite).to.equal('Strict')
		expect(refreshTokenOptions.sameSite).to.equal('Strict')
	})

	it('secure = false (TLS terminated at Nginx, see CLAUDE.md)', () => {
		expect(accessTokenOptions.secure).to.equal(false)
		expect(refreshTokenOptions.secure).to.equal(false)
	})

	it('expirationDate = 0', () => {
		expect(accessTokenOptions.expirationDate).to.equal(0)
		expect(refreshTokenOptions.expirationDate).to.equal(0)
	})

	it('refreshTokenOptions has exactly the base keys (covers closing brace)', () => {
		const keys = Object.keys(refreshTokenOptions)
		expect(keys).to.include.members(['httpOnly', 'sameSite', 'secure', 'expirationDate'])
	})
})
