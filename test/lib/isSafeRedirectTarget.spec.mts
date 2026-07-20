import { isSafeRedirectTarget } from '@lib/isSafeRedirectTarget.mjs'
import { expect } from 'chai'

describe('isSafeRedirectTarget', () => {
	it('accepts an absolute path under /x/', () => {
		expect(isSafeRedirectTarget('/x/registration-done')).to.equal(true)
	})

	it('accepts percent-encoded content after the literal /x/ prefix', () => {
		expect(isSafeRedirectTarget('/x/error%20page')).to.equal(true)
	})

	it('accepts nested segments under /x/', () => {
		expect(isSafeRedirectTarget('/x/a/b/c')).to.equal(true)
	})

	// The cases below are the reason this function exists. A guard weakened to
	// `startsWith('/')` was verified to pass both the semgrep scan and the whole test
	// suite while admitting the first of them.
	it('rejects a protocol-relative URL — the startsWith("/") trap', () => {
		expect(isSafeRedirectTarget('//evil.com')).to.equal(false)
	})

	it('rejects a protocol-relative URL that also mentions the prefix', () => {
		expect(isSafeRedirectTarget('//evil.com/x/ok')).to.equal(false)
	})

	it('rejects an absolute http(s) URL', () => {
		expect(isSafeRedirectTarget('https://evil.com')).to.equal(false)
		expect(isSafeRedirectTarget('http://evil.com/x/ok')).to.equal(false)
	})

	it('rejects a backslash-prefixed target — browsers may normalise \\ to /', () => {
		expect(isSafeRedirectTarget('/\\evil.com')).to.equal(false)
		expect(isSafeRedirectTarget('\\\\evil.com')).to.equal(false)
	})

	it('rejects a javascript: scheme', () => {
		expect(isSafeRedirectTarget('javascript:alert(1)')).to.equal(false)
	})

	it('rejects a path that only looks prefixed', () => {
		expect(isSafeRedirectTarget('/xx/ok')).to.equal(false)
		expect(isSafeRedirectTarget('/y/x/ok')).to.equal(false)
	})

	it('rejects the bare prefix with no target', () => {
		expect(isSafeRedirectTarget('/x/')).to.equal(false)
	})

	it('rejects a relative path', () => {
		expect(isSafeRedirectTarget('x/ok')).to.equal(false)
	})

	it('rejects the empty string', () => {
		expect(isSafeRedirectTarget('')).to.equal(false)
	})

	it('rejects an ordinary error message — the catch-block default path', () => {
		expect(isSafeRedirectTarget('MongoNetworkError: connection refused')).to.equal(false)
	})

	it('rejects trailing content after a newline — the anchors must hold', () => {
		expect(isSafeRedirectTarget('/x/ok\nhttps://evil.com')).to.equal(false)
	})

	it('rejects a target containing a query or fragment delimiter', () => {
		expect(isSafeRedirectTarget('/x/ok?next=//evil.com')).to.equal(false)
		expect(isSafeRedirectTarget('/x/ok#//evil.com')).to.equal(false)
	})
})
