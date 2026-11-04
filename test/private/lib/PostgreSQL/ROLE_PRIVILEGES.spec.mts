import { ROLE_PRIVILEGES } from '@private/lib/PostgreSQL/ROLE_PRIVILEGES.mjs'
import { expect } from 'chai'

describe('ROLE_PRIVILEGES', () => {
	it('holds the privileges of a schema', () => {
		expect([...ROLE_PRIVILEGES.schema]).to.deep.equal(['USAGE', 'CREATE'])
	})

	it('holds the privileges of a table, a view or a sequence', () => {
		expect([...ROLE_PRIVILEGES.relation]).to.deep.equal([
			'SELECT',
			'INSERT',
			'UPDATE',
			'DELETE',
			'TRUNCATE',
			'REFERENCES',
			'TRIGGER',
			'USAGE'
		])
	})

	it('holds the privileges a column can have', () => {
		expect([...ROLE_PRIVILEGES.column]).to.deep.equal(['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'])
	})

	it('has no other kind', () => {
		expect(Object.keys(ROLE_PRIVILEGES)).to.deep.equal(['schema', 'relation', 'column'])
	})
})
