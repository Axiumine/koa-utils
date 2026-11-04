import { VERSION_GUARD_FIELDS } from '@lib/PostgreSQL/guard/VERSION_GUARD_FIELDS.mjs'
import { expect } from 'chai'

describe('VERSION_GUARD_FIELDS', () => {
	it('holds the two guarded columns, in order', () => {
		expect([...VERSION_GUARD_FIELDS]).to.deep.equal(['version', 'rev'])
	})
})
