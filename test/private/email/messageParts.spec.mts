/**
 * Spec private/email/messageParts.mts
 *
 * fixName, htmlLink (escape href + text), httpLinkBase (scheme check on parsed URL),
 * confirmationLink (base check + slash edges + encodeURI).
 */
import { confirmationLink, fixName, htmlLink, httpLinkBase } from '@private/email/messageParts.mjs'
import { expect } from 'chai'

import { expectGraphQLError } from '../../helpers/assertGraphQLError.mjs'

/** every bad base → same 500: throwInternalError(), no extra text */
const expectRejected = (fn: () => unknown, label: string): void => {
	try {
		expectGraphQLError(fn, 500, 'Internal Server Error', 'Error reported to Dev Team.')
	} catch (e) {
		throw new Error(`${label}: ${(e as Error).message}`, { cause: e })
	}
}

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

	it('rejects an empty base instead of emitting a host-less link', () => {
		expectRejected(() => confirmationLink('', '/p', 'u@x.com', 'h'), 'empty')
	})

	it('rejects a base that is not an http(s) URL, before any join', () => {
		expectRejected(() => confirmationLink('javascript:alert(1)//', '/p', 'u@x.com', 'h'), 'javascript:')
		expectRejected(() => confirmationLink('//evil.example', '/p', 'u@x.com', 'h'), 'scheme-relative')
		expectRejected(() => confirmationLink('https://good@evil.example', '/p', 'u@x.com', 'h'), 'userinfo')
	})

	it('accepts an http base as well as https', () => {
		expect(confirmationLink('http://localhost:3000/', '/p', 'u@x.com', 'h')).to.equal('http://localhost:3000/p/u@x.com/h')
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

describe('httpLinkBase', () => {
	const accepted: [string, string][] = [
		['https', 'https://a.example.com'],
		['http', 'http://a.example.com'],
		['http with port', 'http://localhost:3000'],
		['uppercase scheme and host', 'HTTPS://A.EXAMPLE.COM'],
		['mixed-case scheme', 'hTtPs://a.example.com'],
		['trailing slash', 'https://a.example.com/'],
		['path', 'https://a.example.com/app/'],
		['IPv6 host', 'http://[::1]:8080'],
		['query with quote and ampersand', "https://a.example.com/?a=1&b='2'"],
		['non-ASCII host', 'https://bücher.example']
	]

	for (const [label, base] of accepted) {
		it(`returns an ${label} base exactly as given`, () => {
			expect(httpLinkBase(base)).to.equal(base)
		})
	}

	// each = other scheme | no scheme | userinfo | string parser reads differently than written
	const rejected: [string, unknown][] = [
		['javascript: scheme', 'javascript:alert(1)'],
		['javascript: scheme in mixed case', 'JaVaScRiPt:alert(1)'],
		['javascript: scheme in upper case', 'JAVASCRIPT:alert(1)'],
		['javascript: scheme after a space', ' javascript:alert(1)'],
		['javascript: scheme after a newline', '\njavascript:alert(1)'],
		['javascript: scheme with a tab inside', 'java\tscript:alert(1)'],
		['javascript: scheme with a newline inside', 'java\nscript:alert(1)'],
		['javascript: scheme with a carriage return inside', 'java\rscript:alert(1)'],
		['javascript: scheme after a control character', '\u0001javascript:alert(1)'],
		['data: scheme', 'data:text/html,<script>alert(1)</script>'],
		['vbscript: scheme', 'vbscript:msgbox(1)'],
		['file: scheme', 'file:///etc/passwd'],
		['ftp: scheme', 'ftp://a.example.com'],
		['mailto: scheme', 'mailto:a@example.com'],
		['ws: scheme', 'ws://a.example.com'],
		['wss: scheme', 'wss://a.example.com'],
		['blob: scheme', 'blob:https://a.example.com/uuid'],
		['scheme-relative URL', '//evil.example'],
		['absolute path', '/check/verify-email'],
		['relative path', 'check/verify-email'],
		['host without a scheme', 'example.com'],
		['host and port without a scheme', 'localhost:3000'],
		['scheme with no host', 'https:'],
		['empty string', ''],
		['the string an unset APP_DOMAIN becomes', 'undefined'],
		['user name before the host', 'https://good@evil.example'],
		['user name and password before the host', 'https://good:secret@evil.example'],
		['password only before the host', 'https://:secret@evil.example'],
		['leading space', ' https://a.example.com'],
		['trailing space', 'https://a.example.com '],
		['space inside', 'https://a.example.com/a b'],
		['leading newline', '\nhttps://a.example.com'],
		['trailing newline', 'https://a.example.com\n'],
		['tab inside the scheme', 'ht\ttps://a.example.com'],
		['newline inside the host', 'https://a.example\n.com'],
		['leading control character', '\u0001https://a.example.com'],
		['trailing control character', 'https://a.example.com\u0001'],
		['DEL', 'https://a.example.com/\u007f'],
		['C1 control character', 'https://a.example.com/\u0085'],
		['no-break space', 'https://a.example.com/\u00a0'],
		['backslash after the host', 'https://a.example.com\\evil.example'],
		['backslash after the scheme', 'https:\\\\evil.example'],
		['undefined', undefined],
		['null', null],
		['a number', 123]
	]

	for (const [label, base] of rejected) {
		it(`rejects ${label} with the generic 500`, () => {
			expectRejected(() => httpLinkBase(base as string), label)
		})
	}

	it('rejects on the parsed URL, not on a string prefix: a prefix that looks like https still fails', () => {
		// "https://" + trusted-looking name, host = after "@"
		expectRejected(() => httpLinkBase('https://a.example.com@evil.example'), 'lookalike prefix')
		// "http" prefix, other scheme
		expectRejected(() => httpLinkBase('httpx://a.example.com'), 'httpx')
		expectRejected(() => httpLinkBase('http-evil://a.example.com'), 'http-evil')
	})

	it('does not alter or normalise an accepted base', () => {
		// parsed form 'https://a.example.com/' lowercase + slash → caller text emitted as written
		expect(httpLinkBase('HTTPS://A.Example.com')).to.equal('HTTPS://A.Example.com')
	})
})
