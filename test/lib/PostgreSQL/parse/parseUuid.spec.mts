import { parseUuid } from '@lib/PostgreSQL/parse/parseUuid.mjs'
import { expect } from 'chai'

import { errorOf, reasonOf } from '../../../helpers/parseReason.mjs'

describe('parseUuid', () => {
	it('returns a lower case uuid unchanged', () => {
		for (const id of ['0f8fad5b-d9cb-469f-a165-70867728950e', '00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
			expect(parseUuid(id)).to.equal(id)
		}
	})

	const refused = [
		'0F8FAD5B-D9CB-469F-A165-70867728950E',
		'0f8fad5bd9cb469fa16570867728950e',
		'0f8fad5b-d9cb-469f-a165-70867728950',
		'0f8fad5b-d9cb-469f-a165-70867728950ee',
		'{0f8fad5b-d9cb-469f-a165-70867728950e}',
		'0f8fad5b-d9cb-469f-a165-70867728950g',
		' 0f8fad5b-d9cb-469f-a165-70867728950e',
		'0f8fad5b-d9cb-469f-a165-70867728950e ',
		''
	]
	for (const text of refused) {
		it(`refuses ${JSON.stringify(text)}`, () => {
			expect(reasonOf(parseUuid, text)).to.equal('MALFORMED')
		})
	}

	it('names the type in the error', () => {
		expect(errorOf(parseUuid, 'x')?.typeName).to.equal('uuid')
	})
})
