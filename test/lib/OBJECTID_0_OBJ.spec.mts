import { OBJECTID_0_STR } from '@lib/Constants.mjs'
import { OBJECTID_0_OBJ } from '@lib/OBJECTID_0_OBJ.mjs'
import { expect } from 'chai'
import { Types } from 'mongoose'

describe('OBJECTID_0_OBJ', () => {
	it('is a mongoose ObjectId matching the zero string', () => {
		expect(OBJECTID_0_OBJ).to.be.instanceOf(Types.ObjectId)
		expect(OBJECTID_0_OBJ.toString()).to.equal(OBJECTID_0_STR)
	})
})
