import * as Constants from '@lib/Constants.mjs'
import { EMAIL_HASH_LEN, EMAIL_MAX_LEN, MAX_PWD_LENGTH, MIN_PWD_LENGTH, OBJECTID_0_STR } from '@lib/Constants.mjs'
import { expect } from 'chai'

describe('Constants', () => {
	it('OBJECTID_0_STR is 24-char zero ObjectId hex', () => {
		expect(OBJECTID_0_STR).to.equal('000000000000000000000000')
		expect(OBJECTID_0_STR).to.have.lengthOf(24)
	})

	// 8.0.0 breaking: OBJECTID_0_OBJ moved to lib/OBJECTID_0_OBJ → Constants must not load mongoose (peer-reach guard pins it too)
	it('does not export OBJECTID_0_OBJ any more', () => {
		expect(Object.keys(Constants)).to.not.include('OBJECTID_0_OBJ')
	})

	it('EMAIL_MAX_LEN = 255', () => {
		expect(EMAIL_MAX_LEN).to.equal(255)
	})

	it('MIN_PWD_LENGTH = 10', () => {
		expect(MIN_PWD_LENGTH).to.equal(10)
	})

	it('MAX_PWD_LENGTH = 72 (bcrypt limit)', () => {
		expect(MAX_PWD_LENGTH).to.equal(72)
	})

	it('EMAIL_HASH_LEN = 50', () => {
		expect(EMAIL_HASH_LEN).to.equal(50)
	})
})
