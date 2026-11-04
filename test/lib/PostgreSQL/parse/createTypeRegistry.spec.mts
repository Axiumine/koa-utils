import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { createTypeRegistry } from '@lib/PostgreSQL/parse/createTypeRegistry.mjs'
import type { IDriverTypes } from '@lib/PostgreSQL/parse/IDriverTypes.mjs'
import { expect } from 'chai'
import pg from 'pg'
import sinon from 'sinon'

// real pg module as DATA (its default parsers). No connect. Typed: getTypeParser return any
const driverTypes: IDriverTypes = pg.types

describe('createTypeRegistry', () => {
	afterEach(() => {
		sinon.restore()
	})

	it('answers the parsers of the library for their OIDs in text format', () => {
		const registry = createTypeRegistry(driverTypes)
		expect(registry.getTypeParser(1082)('2024-03-10')).to.equal('2024-03-10')
		expect(registry.getTypeParser(1082, 'text')('2024-03-10')).to.equal('2024-03-10')
		expect(registry.getTypeParser(1083)('14:30:00')).to.equal('14:30')
		expect(registry.getTypeParser(1184)('2024-03-10 03:30:00-07')).to.equal('2024-03-10T10:30:00.000Z')
		expect(registry.getTypeParser(20)('9223372036854775807')).to.equal('9223372036854775807')
		expect(registry.getTypeParser(2951)('{0f8fad5b-d9cb-469f-a165-70867728950e}')).to.deep.equal(['0f8fad5b-d9cb-469f-a165-70867728950e'])
		expect(registry.getTypeParser(1185)('{"2024-03-10 03:30:00-07"}')).to.deep.equal(['2024-03-10T10:30:00.000Z'])
		expect(registry.getTypeParser(1182)('{2024-03-10,NULL}')).to.deep.equal(['2024-03-10', null])
		expect(registry.getTypeParser(1183)('{14:30:00}')).to.deep.equal(['14:30'])
		expect(registry.getTypeParser(1016)('{1,9223372036854775807}')).to.deep.equal(['1', '9223372036854775807'])
	})

	it('refuses the two types whose default parser would return a Date', () => {
		const registry = createTypeRegistry(driverTypes)
		for (const [oid, typeName] of [
			[1114, 'timestamp without time zone'],
			[1115, 'timestamp without time zone[]']
		] as const) {
			let caught: unknown
			try {
				registry.getTypeParser(oid)('2024-03-10 10:30:00')
			} catch (error) {
				caught = error
			}
			expect(caught).to.be.instanceOf(DbParseError)
			expect((caught as DbParseError).reason).to.equal('UNSUPPORTED_TYPE')
			expect((caught as DbParseError).typeName).to.equal(typeName)
		}
		// driver own parser for same type = Date parser. That is what refusal replace
		expect(driverTypes.getTypeParser(1114)('2024-03-10 10:30:00')).to.be.instanceOf(Date)
	})

	it('leaves every other type to the driver, with the arguments it was given', () => {
		const parser = (value: string): string => `driver:${value}`
		const getTypeParser = sinon.stub().returns(parser)
		const registry = createTypeRegistry({ getTypeParser })
		expect(registry.getTypeParser(25)).to.equal(parser)
		expect(registry.getTypeParser(25, 'text')).to.equal(parser)
		expect(getTypeParser.firstCall.args).to.deep.equal([25, undefined])
		expect(getTypeParser.secondCall.args).to.deep.equal([25, 'text'])
	})

	it('leaves a binary request to the driver even for an OID of the library', () => {
		const binary = (value: string): string => `binary:${value}`
		const getTypeParser = sinon.stub().returns(binary)
		const registry = createTypeRegistry({ getTypeParser })
		expect(registry.getTypeParser(1082, 'binary')).to.equal(binary)
		expect(getTypeParser.calledOnceWithExactly(1082, 'binary')).to.equal(true)
	})

	it('is a new object per call and never writes the registry of the driver', () => {
		const before = driverTypes.getTypeParser(1082, 'text')
		const setTypeParser = sinon.spy(pg.types, 'setTypeParser')
		const first = createTypeRegistry(driverTypes)
		const second = createTypeRegistry(driverTypes)
		expect(first).to.not.equal(second)
		first.getTypeParser(1082)
		expect(setTypeParser.called).to.equal(false)
		expect(driverTypes.getTypeParser(1082, 'text')).to.equal(before)
		// default parsers of driver still Date parsers
		expect(driverTypes.getTypeParser(1082, 'text')('2024-03-10')).to.be.instanceOf(Date)
		expect(driverTypes.getTypeParser(1184, 'text')('2024-03-10 10:30:00+00')).to.be.instanceOf(Date)
	})

	it('reads the driver lazily: a parser registered on the driver later is seen for other types', () => {
		const table = new Map<number, (value: string) => unknown>()
		const lazy: IDriverTypes = { getTypeParser: (oid) => table.get(oid) ?? ((value: string) => value) }
		const registry = createTypeRegistry(lazy)
		expect(registry.getTypeParser(600)('x')).to.equal('x')
		table.set(600, () => 'late')
		expect(registry.getTypeParser(600)('x')).to.equal('late')
	})
})
