import { TYPE_PARSERS } from '@lib/PostgreSQL/parse/TYPE_PARSERS.mjs'
import { expect } from 'chai'

describe('TYPE_PARSERS', () => {
	it('has no OID and no type name twice', () => {
		expect(new Set(TYPE_PARSERS.map((entry) => entry.oid)).size).to.equal(TYPE_PARSERS.length)
		expect(new Set(TYPE_PARSERS.map((entry) => entry.typeName)).size).to.equal(TYPE_PARSERS.length)
	})

	it('holds the OIDs of the built-in types', () => {
		const oids = Object.fromEntries(TYPE_PARSERS.map((entry) => [entry.typeName, entry.oid]))
		expect(oids).to.deep.equal({
			bigint: 20,
			date: 1082,
			'time without time zone': 1083,
			'timestamp with time zone': 1184,
			'bigint[]': 1016,
			'date[]': 1182,
			'time without time zone[]': 1183,
			'timestamp with time zone[]': 1185,
			'uuid[]': 2951,
			'timestamp without time zone': 1114,
			'timestamp without time zone[]': 1115
		})
	})

	it('names the array type in the error of each array parser', () => {
		// typeName passed to arrayOf must equal entry typeName → error says which column type failed
		const arrays = TYPE_PARSERS.filter((entry) => entry.typeName.endsWith('[]') && entry.oid !== 1115)
		expect(arrays).to.have.lengthOf(5)
		for (const entry of arrays) {
			let caught: unknown
			try {
				entry.parse('not an array')
			} catch (error) {
				caught = error
			}
			expect((caught as { typeName?: string }).typeName, entry.typeName).to.equal(entry.typeName)
		}
	})

	it('names the type in the error of each scalar parser and of each refusal', () => {
		for (const entry of TYPE_PARSERS.filter((e) => !e.typeName.endsWith('[]'))) {
			let caught: unknown
			try {
				entry.parse('not a value')
			} catch (error) {
				caught = error
			}
			expect((caught as { typeName?: string }).typeName, entry.typeName).to.equal(entry.typeName)
		}
		let refused: unknown
		try {
			TYPE_PARSERS.find((entry) => entry.oid === 1115)?.parse('{}')
		} catch (error) {
			refused = error
		}
		expect((refused as { typeName?: string }).typeName).to.equal('timestamp without time zone[]')
		expect((refused as { reason?: string }).reason).to.equal('UNSUPPORTED_TYPE')
	})
})
