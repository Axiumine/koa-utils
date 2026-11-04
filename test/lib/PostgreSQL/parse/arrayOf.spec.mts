import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { arrayOf } from '@lib/PostgreSQL/parse/arrayOf.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'
import { parseDate } from '@lib/PostgreSQL/parse/parseDate.mjs'
import { parseTimestamptz } from '@lib/PostgreSQL/parse/parseTimestamptz.mjs'
import { parseUuid } from '@lib/PostgreSQL/parse/parseUuid.mjs'
import { expect } from 'chai'

import { errorOf, reasonOf } from '../../../helpers/parseReason.mjs'

describe('arrayOf', () => {
	const identity: IStringParser = (text) => text
	const parse = arrayOf(identity, 'text[]')

	const accepted: [string, (string | null)[]][] = [
		['{}', []],
		['{a}', ['a']],
		['{a,b,c}', ['a', 'b', 'c']],
		['{"a b","c,d"}', ['a b', 'c,d']],
		['{"{x}","y\\"z"}', ['{x}', 'y"z']],
		['{"back\\\\slash"}', ['back\\slash']],
		['{"any\\xchar"}', ['anyxchar']],
		['{NULL}', [null]],
		['{null,x}', [null, 'x']],
		['{Null}', [null]],
		['{"NULL"}', ['NULL']],
		['{NULLS}', ['NULLS']],
		['{""}', ['']],
		['{a,NULL,"b c"}', ['a', null, 'b c']],
		['{"line\nbreak"}', ['line\nbreak']],
		// backslash before white space inside quotes → escape of any char incl. space, tab, newline
		['{"a\\ b"}', ['a b']],
		['{"a\\\tb"}', ['a\tb']],
		['{"a\\\nb"}', ['a\nb']],
		['{"a","b"}', ['a', 'b']]
	]
	for (const [text, expected] of accepted) {
		it(`reads ${JSON.stringify(text)} as ${JSON.stringify(expected)}`, () => {
			expect(parse(text)).to.deep.equal(expected)
		})
	}

	const refused = [
		'',
		'a',
		'{',
		'}',
		'{a',
		'a}',
		'{a,}',
		'{,a}',
		'{a,,b}',
		'{{a}}',
		'{{1,2},{3,4}}',
		'{"a}',
		'{"a\\',
		'{"a"b}',
		'{a b}',
		'{a}x',
		'x{a}',
		'[0:1]={a,b}',
		'{a"b}',
		'{a\\b}',
		'{a{b}',
		// quoted element then junk, then a good element
		'{"a" ,b}',
		// closing quote escaped → unterminated
		'{"a\\"}'
	]
	for (const text of refused) {
		it(`refuses ${JSON.stringify(text)}`, () => {
			expect(reasonOf(parse, text)).to.equal('MALFORMED')
		})
	}

	it('names the array type in the error', () => {
		expect(errorOf(parse, '{')?.typeName).to.equal('text[]')
		expect(errorOf(parse, '{a,}')?.typeName).to.equal('text[]')
		expect(errorOf(parse, 'x')?.typeName).to.equal('text[]')
	})

	it('runs every element through the element parser and leaves null alone', () => {
		const seen: string[] = []
		const spy = arrayOf((text) => (seen.push(text), text.toUpperCase()), 't[]')
		expect(spy('{a,NULL,"b c"}')).to.deep.equal(['A', null, 'B C'])
		// null never reach element parser
		expect(seen).to.deep.equal(['a', 'b c'])
	})

	it('wraps the real parsers', () => {
		const dates = arrayOf(parseDate, 'date[]')
		expect(dates('{2024-03-10,NULL,2024-03-11}')).to.deep.equal(['2024-03-10', null, '2024-03-11'])
		expect(reasonOf(dates, '{2024-03-10,infinity}')).to.equal('MALFORMED')
		const instants = arrayOf(parseTimestamptz, 'timestamp with time zone[]')
		expect(instants('{"2024-03-10 03:30:00-07","2024-03-10 10:30:00.123456+00"}')).to.deep.equal([
			'2024-03-10T10:30:00.000Z',
			'2024-03-10T10:30:00.123Z'
		])
		const ids = arrayOf(parseUuid, 'uuid[]')
		expect(ids('{0f8fad5b-d9cb-469f-a165-70867728950e,a1b2c3d4-0000-4000-8000-000000000001}')).to.deep.equal([
			'0f8fad5b-d9cb-469f-a165-70867728950e',
			'a1b2c3d4-0000-4000-8000-000000000001'
		])
		expect(reasonOf(ids, '{not-a-uuid}')).to.equal('MALFORMED')
	})

	it('keeps the element error: its type name is the element type, not the array', () => {
		expect(errorOf(arrayOf(parseDate, 'date[]'), '{infinity}')?.typeName).to.equal('date')
	})

	it('throws a DbParseError, not a TypeError, for a text that is not an array', () => {
		expect(() => parse('nope')).to.throw(DbParseError)
	})

	it('can be called again after a failure (no scanner state leaks between calls)', () => {
		expect(reasonOf(parse, '{"unterminated')).to.equal('MALFORMED')
		expect(parse('{a,b}')).to.deep.equal(['a', 'b'])
		expect(parse('{x}')).to.deep.equal(['x'])
	})
})
