import { roleCheckOf } from '@private/lib/PostgreSQL/roleCheckOf.mjs'
import { expect } from 'chai'

describe('roleCheckOf', () => {
	it('reads a schema grant: a plain name with USAGE or CREATE', () => {
		expect(roleCheckOf({ object: 'app', privilege: 'USAGE' })).to.deep.equal({
			kind: 'schema',
			object: 'app',
			privilege: 'USAGE'
		})
		expect(roleCheckOf({ object: 'app', privilege: 'CREATE' })).to.deep.equal({
			kind: 'schema',
			object: 'app',
			privilege: 'CREATE'
		})
	})

	it('reads a function grant: schema.name with EXECUTE and no columns', () => {
		expect(roleCheckOf({ object: 'app.f', privilege: 'EXECUTE' })).to.deep.equal({
			kind: 'function',
			object: 'app.f',
			privilege: 'EXECUTE'
		})
	})

	it('reads a relation grant: schema.name with a table privilege and no columns', () => {
		for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'USAGE']) {
			expect(roleCheckOf({ object: 'app.t', privilege })).to.deep.equal({ kind: 'relation', object: 'app.t', privilege })
		}
	})

	it('reads a column grant: schema.name with a column privilege and a non-empty list of names', () => {
		for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) {
			expect(roleCheckOf({ object: 'app.t', privilege, columns: ['a', 'b'] })).to.deep.equal({
				kind: 'columns',
				object: 'app.t',
				privilege,
				columns: ['a', 'b']
			})
		}
	})

	it('keeps nothing but kind, object, privilege and columns', () => {
		const check = roleCheckOf({ object: 'app.t', privilege: 'SELECT', extra: 'x' })
		expect(Object.keys(check ?? {})).to.deep.equal(['kind', 'object', 'privilege'])
	})

	it('answers undefined for anything that is not an object', () => {
		for (const grant of [undefined, null, 'app', 5, true]) expect(roleCheckOf(grant)).to.equal(undefined)
	})

	it('answers undefined for an object that is neither a plain name nor schema.name', () => {
		for (const object of [undefined, null, 5, '', 'a.b.c', 'a b', 'app."t"', '1a', '.t', 'a.']) {
			expect(roleCheckOf({ object, privilege: 'SELECT' }), String(object)).to.equal(undefined)
		}
	})

	it('answers undefined for a schema with a table privilege, with EXECUTE, or with columns', () => {
		expect(roleCheckOf({ object: 'app', privilege: 'SELECT' })).to.equal(undefined)
		expect(roleCheckOf({ object: 'app', privilege: 'EXECUTE' })).to.equal(undefined)
		expect(roleCheckOf({ object: 'app', privilege: 'USAGE', columns: ['a'] })).to.equal(undefined)
		expect(roleCheckOf({ object: 'app', privilege: 'USAGE', columns: [] })).to.equal(undefined)
		expect(roleCheckOf({ object: 'app' })).to.equal(undefined)
	})

	it('answers undefined for EXECUTE with columns, even an empty list', () => {
		expect(roleCheckOf({ object: 'app.f', privilege: 'EXECUTE', columns: ['a'] })).to.equal(undefined)
		expect(roleCheckOf({ object: 'app.f', privilege: 'EXECUTE', columns: [] })).to.equal(undefined)
	})

	it('answers undefined for a privilege a table cannot hold, or in another case, or not a string', () => {
		for (const privilege of ['CREATE', 'select', 'Select', 'EXECUTE ', 'ALL', '', undefined, 3, ['SELECT']]) {
			expect(roleCheckOf({ object: 'app.t', privilege }), String(privilege)).to.equal(undefined)
		}
	})

	it('answers undefined for columns with a privilege a column cannot hold', () => {
		for (const privilege of ['DELETE', 'TRUNCATE', 'TRIGGER', 'USAGE', 'CREATE', 'select', undefined]) {
			expect(roleCheckOf({ object: 'app.t', privilege, columns: ['a'] }), String(privilege)).to.equal(undefined)
		}
	})

	it('answers undefined for columns that are empty, not a list, null, or hold a non-name', () => {
		for (const columns of [[], 'a', null, 5, {}, ['a b'], ['a', 3], [''], ['a.b']]) {
			expect(roleCheckOf({ object: 'app.t', privilege: 'SELECT', columns }), JSON.stringify(columns)).to.equal(undefined)
		}
	})
})
