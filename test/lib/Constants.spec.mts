import {
	EMAIL_HASH_LEN,
	EMAIL_MAX_LEN,
	MAX_PWD_LENGTH,
	MIN_PWD_LENGTH,
	OBJECTID_0_OBJ,
	OBJECTID_0_STR
} from '@lib/Constants.mjs'
import { expect } from 'chai'
import { Types } from 'mongoose'

describe('Constants', () => {
	it('OBJECTID_0_STR is 24-char zero ObjectId hex', () => {
		expect(OBJECTID_0_STR).to.equal('000000000000000000000000')
		expect(OBJECTID_0_STR).to.have.lengthOf(24)
	})

	it('OBJECTID_0_OBJ is a mongoose ObjectId matching the zero string', () => {
		expect(OBJECTID_0_OBJ).to.be.instanceOf(Types.ObjectId)
		expect(OBJECTID_0_OBJ.toString()).to.equal(OBJECTID_0_STR)
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
