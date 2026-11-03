/**
 * Spec private/email/escapeHtml.mts
 *
 * 5 chars map → entity. `&` first → no double escape of added entities. Non-ASCII untouched.
 */
import { escapeHtml } from '@private/email/escapeHtml.mjs'
import { expect } from 'chai'

describe('escapeHtml', () => {
	it('escapes each of & < > " and the apostrophe to its own entity', () => {
		expect(escapeHtml('&')).to.equal('&amp;')
		expect(escapeHtml('<')).to.equal('&lt;')
		expect(escapeHtml('>')).to.equal('&gt;')
		expect(escapeHtml('"')).to.equal('&quot;')
		expect(escapeHtml("'")).to.equal('&#39;')
	})

	it('escapes every occurrence, not only the first', () => {
		expect(escapeHtml('<<>>&&""\'\'')).to.equal('&lt;&lt;&gt;&gt;&amp;&amp;&quot;&quot;&#39;&#39;')
	})

	it('escapes a script tag with quotes into inert text', () => {
		expect(escapeHtml('<script>alert("x")</script>')).to.equal('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
	})

	it('escapes the ampersand first so an existing entity is escaped, not left live', () => {
		// `&lt;` in input = literal text user typed → must show as typed, not become `<`
		expect(escapeHtml('&lt;')).to.equal('&amp;lt;')
	})

	it('leaves letters, digits, spaces and non-ASCII text untouched', () => {
		expect(escapeHtml('Zoë 日本 émoji 😀 abc 123')).to.equal('Zoë 日本 émoji 😀 abc 123')
	})

	it('returns the empty string for the empty string', () => {
		expect(escapeHtml('')).to.equal('')
	})

	it('accepts a number and returns its decimal text', () => {
		expect(escapeHtml(42)).to.equal('42')
	})

	it('stringifies a non-string at runtime the way string concatenation did', () => {
		// JS caller pass Error to alertDevTeam → old code concat → text. Must not throw.
		expect(escapeHtml(new Error('<b>') as unknown as string)).to.equal('Error: &lt;b&gt;')
	})
})
