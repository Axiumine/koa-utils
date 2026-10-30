/**
 * Spec private/email/messageParts.mts
 *
 * fixName, htmlLink (escape href + text), confirmationLink (slash edges + encodeURI).
 */
import { confirmationLink, fixName, htmlLink } from '@private/email/messageParts.mjs'
import { expect } from 'chai'

describe('fixName', () => {
	it('returns a leading space plus the name', () => {
		expect(fixName('Alice')).to.equal(' Alice')
	})

	it('returns the empty string for the empty name', () => {
		expect(fixName('')).to.equal('')
	})

	it('does not escape: plain-text part use it raw', () => {
		expect(fixName('<b>')).to.equal(' <b>')
	})
})

describe('htmlLink', () => {
	it('uses the link as visible text when no text is given', () => {
		expect(htmlLink('https://x.example.com/a')).to.equal(
			"<a target='_blank' href='https://x.example.com/a'>https://x.example.com/a</a>"
		)
	})

	it('uses the given text as visible text', () => {
		expect(htmlLink('https://x.example.com', 'Home')).to.equal("<a target='_blank' href='https://x.example.com'>Home</a>")
	})

	it('escapes the href so a quote cannot close the attribute', () => {
		const html = htmlLink("https://x.example.com/?a=1&b='2'\"><script>")
		expect(html).to.equal(
			"<a target='_blank' href='https://x.example.com/?a=1&amp;b=&#39;2&#39;&quot;&gt;&lt;script&gt;'>" +
				'https://x.example.com/?a=1&amp;b=&#39;2&#39;&quot;&gt;&lt;script&gt;</a>'
		)
	})

	it('escapes the visible text', () => {
		const html = htmlLink('https://x.example.com', '<b>Tom & "Jerry"</b>')
		expect(html).to.equal(
			"<a target='_blank' href='https://x.example.com'>&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;</a>"
		)
	})
})

describe('confirmationLink', () => {
	it('joins base, path, encoded email and hash', () => {
		expect(confirmationLink('https://a.example.com', '/check/verify-email', 'u@x.com', 'h1')).to.equal(
			'https://a.example.com/check/verify-email/u@x.com/h1'
		)
	})

	it('drops every trailing slash of the base', () => {
		expect(confirmationLink('https://a.example.com///', '/p', 'u@x.com', 'h')).to.equal('https://a.example.com/p/u@x.com/h')
	})

	it('keeps slashes inside the base', () => {
		expect(confirmationLink('https://a.example.com/app/', '/p', 'u@x.com', 'h')).to.equal('https://a.example.com/app/p/u@x.com/h')
	})

	it('keeps a base that has no trailing slash as it is', () => {
		expect(confirmationLink('https://a.example.com', '/p', 'u@x.com', 'h')).to.equal('https://a.example.com/p/u@x.com/h')
	})

	it('copes with an empty base', () => {
		expect(confirmationLink('', '/p', 'u@x.com', 'h')).to.equal('/p/u@x.com/h')
	})

	it('drops every leading slash of the path and adds exactly one', () => {
		expect(confirmationLink('https://a.example.com', '///p//q', 'u@x.com', 'h')).to.equal('https://a.example.com/p//q/u@x.com/h')
	})

	it('adds the missing leading slash of the path', () => {
		expect(confirmationLink('https://a.example.com', 'p', 'u@x.com', 'h')).to.equal('https://a.example.com/p/u@x.com/h')
	})

	it('encodes the email with encodeURI and leaves the hash as given', () => {
		expect(confirmationLink('https://a.example.com', '/p', 'a b+c"d@x.com', 'h"1')).to.equal(
			'https://a.example.com/p/a%20b+c%22d@x.com/h"1'
		)
	})
})
