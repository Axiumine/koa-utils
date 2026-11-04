import { isAbsolutePath } from '@lib/PostgreSQL/url/isAbsolutePath.mjs'
import { expect } from 'chai'

describe('isAbsolutePath', () => {
	for (const text of ['/', '/run/files/pg.secret', '/etc/app/cert-1.crt', '/a/..b', '/a/b..', '/...']) {
		it(`accepts ${JSON.stringify(text)}`, () => {
			expect(isAbsolutePath(text)).to.equal(true)
		})
	}

	const invalid = [
		'relative/path',
		'./relative',
		'../up',
		'~/home',
		'C:\\files\\pg',
		'file:///etc/passwd',
		'/a/../b',
		'/a/..',
		'/../a',
		'/a\nb',
		'/a\u0000b',
		'/a\tb',
		'/a\u001fb',
		'/a\u007fb',
		''
	]
	for (const text of invalid) {
		it(`refuses ${JSON.stringify(text)}`, () => {
			expect(isAbsolutePath(text)).to.equal(false)
		})
	}

	it('accepts a space and a non-ASCII character: only control characters are refused', () => {
		// 0x20 not control. boundary for < 0x20 mutant
		expect(isAbsolutePath('/a b')).to.equal(true)
		expect(isAbsolutePath('/ünï')).to.equal(true)
	})
})
