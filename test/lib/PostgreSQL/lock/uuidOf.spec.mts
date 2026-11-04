import { uuidOf } from '@lib/PostgreSQL/lock/uuidOf.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

describe('uuidOf', () => {
	it('answers the id in lower case', () => {
		expect(uuidOf(ID, 'rowId')).to.equal(ID)
		expect(uuidOf(ID.toUpperCase(), 'rowId')).to.equal(ID)
		expect(uuidOf('00000000-0000-0000-0000-000000000000', 'rowId')).to.equal('00000000-0000-0000-0000-000000000000')
	})

	it('refuses what is not the text form of a uuid, naming the argument and never quoting the value', () => {
		const planted = 'planted-secret-value-1234'
		const bad: unknown[] = [
			planted,
			undefined,
			null,
			1,
			{},
			[ID],
			'',
			ID.slice(1),
			`${ID}0`,
			` ${ID}`,
			`${ID}\n`,
			ID.replaceAll('-', ''),
			ID.replace('a', 'g'),
			`{${ID}}`
		]
		for (const value of bad) {
			const error = thrownBy(() => uuidOf(value, 'rowId'))
			expect(error).to.be.instanceOf(TypeError)
			expect(error).to.have.property('message', 'rowId must be a UUID')
		}
	})

	it('uses the label it is given', () => {
		expect(thrownBy(() => uuidOf('x', 'groupId'))).to.have.property('message', 'groupId must be a UUID')
	})
})
