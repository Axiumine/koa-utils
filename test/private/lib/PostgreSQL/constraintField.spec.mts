import { constraintField } from '@private/lib/PostgreSQL/constraintField.mjs'
import { expect } from 'chai'

describe('constraintField', () => {
	it('answers { constraint } for a name', () => {
		expect(constraintField('customers_email_uq')).to.deep.equal({ constraint: 'customers_email_uq' })
	})

	it('answers an object with no key for undefined, so a log line has no constraint field', () => {
		const field = constraintField(undefined)
		expect(field).to.deep.equal({})
		expect('constraint' in field).to.equal(false)
	})
})
