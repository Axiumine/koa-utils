import { isValidUuidV4 } from '@lib/isValidUuidV4.mjs'
import { generateAccessToken, generateRefreshToken } from '@lib/tokens.mjs'
import { expect } from 'chai'

const VALID = '11111111-1111-4111-8111-111111111111'

describe('isValidUuidV4', () => {
	it('accepts a well-formed v4 uuid', () => {
		expect(isValidUuidV4(VALID)).to.equal(true)
	})

	it('accepts an uppercase v4 uuid', () => {
		expect(isValidUuidV4(VALID.toUpperCase())).to.equal(true)
	})

	it('accepts what generateAccessToken / generateRefreshToken produce', () => {
		expect(isValidUuidV4(generateAccessToken())).to.equal(true)
		expect(isValidUuidV4(generateRefreshToken())).to.equal(true)
	})

	it('rejects the empty string', () => {
		expect(isValidUuidV4('')).to.equal(false)
	})

	it('rejects an arbitrary string', () => {
		expect(isValidUuidV4('not-a-uuid')).to.equal(false)
	})

	it('rejects a uuid of another version', () => {
		expect(isValidUuidV4('11111111-1111-1111-8111-111111111111')).to.equal(false)
	})

	it('rejects a wrong variant nibble', () => {
		expect(isValidUuidV4('11111111-1111-4111-0111-111111111111')).to.equal(false)
	})

	it('rejects a uuid with trailing content — the anchors must hold', () => {
		expect(isValidUuidV4(`${VALID}:refresh:other`)).to.equal(false)
	})

	it('rejects a uuid with a newline appended', () => {
		expect(isValidUuidV4(`${VALID}\n`)).to.equal(false)
	})
})
