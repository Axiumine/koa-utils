import { sqlstateField } from '@lib/PostgreSQL/error/sqlstateField.mjs'
import { expect } from 'chai'

describe('sqlstateField', () => {
	it('is present only for a code', () => {
		expect(sqlstateField('23505')).to.deep.equal({ sqlstate: '23505' })
		expect(sqlstateField(undefined)).to.deep.equal({})
	})

	it('has no sqlstate key at all when there is no code', () => {
		// key present with undefined → exactOptionalPropertyTypes callers + JSON log differ
		expect(Object.keys(sqlstateField(undefined))).to.deep.equal([])
	})
})
