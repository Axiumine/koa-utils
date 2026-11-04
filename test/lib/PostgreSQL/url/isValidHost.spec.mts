import { isValidHost } from '@lib/PostgreSQL/url/isValidHost.mjs'
import { expect } from 'chai'

const label = (text: string): string => (text.length > 40 ? `${text.slice(0, 20)}... (${text.length} chars)` : JSON.stringify(text))

describe('isValidHost', () => {
	const valid = [
		'localhost',
		'db.internal',
		'a-b.example.com',
		'db1',
		'a',
		'127.0.0.1',
		'10.0.0.12',
		'::1',
		'2001:db8::1',
		`${'a'.repeat(63)}.example`,
		// longest allowed: 253 chars = 3 labels of 63 + dots + 1 label of 61
		`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`
	]
	for (const text of valid) {
		it(`accepts ${label(text)}`, () => {
			expect(isValidHost(text)).to.equal(true)
		})
	}

	const invalid = [
		'http://db.internal',
		'postgres://db.internal',
		'db.internal:5432',
		'db.internal/db',
		'user@db.internal',
		'[::1]',
		'fe80::1%eth0',
		'a_b.internal',
		'-a.internal',
		'a-.internal',
		'a..internal',
		'db.internal.',
		'.internal',
		'999.1.1.1',
		'127.1',
		'01.2.3.4',
		'8080',
		'a b',
		'',
		`${'a'.repeat(64)}.example`,
		Array.from({ length: 70 }, () => 'abc').join('.'),
		// 254 chars, every label valid → only the length cap refuses it
		`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`
	]
	for (const text of invalid) {
		it(`refuses ${label(text)}`, () => {
			expect(isValidHost(text)).to.equal(false)
		})
	}

	it('refuses a name whose last label is all digits, but not one with digits inside a label', () => {
		expect(isValidHost('host.123')).to.equal(false)
		expect(isValidHost('host.12a')).to.equal(true)
		expect(isValidHost('host.a12')).to.equal(true)
	})
})
