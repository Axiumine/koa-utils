/**
 * Spec private/email/htmlFrame.mts
 *
 * Fallback header/footer pinned exact (inbox markup). standaloneHeader escape title. orFallback pick.
 */
import { FALLBACK_FOOTER, FALLBACK_HEADER_1, FALLBACK_HEADER_2, orFallback, standaloneHeader } from '@private/email/htmlFrame.mjs'
import { expect } from 'chai'

const DOCTYPE =
	'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
const HEAD_OPEN = ' <head>  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />  <title>'
const AFTER_TITLE =
	'</title>  <meta name="viewport" content="width=device-width, initial-scale=1.0"/></head></html>' +
	'<body style="margin: 0; padding: 0;"> <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">  <tr>' +
	'   <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;"><p style="color: #000000; font-family: Verdana, sans-serif; font-size: 12pt;">'

describe('htmlFrame', () => {
	it('FALLBACK_HEADER_1 is doctype, html lang=en and head up to the opening title tag', () => {
		expect(FALLBACK_HEADER_1).to.equal(DOCTYPE + '<html lang="en" xmlns="http://www.w3.org/1999/xhtml">' + HEAD_OPEN)
	})

	it('FALLBACK_HEADER_2 runs from the closing title tag to the open paragraph', () => {
		expect(FALLBACK_HEADER_2).to.equal(AFTER_TITLE)
	})

	it('FALLBACK_FOOTER closes paragraph, cell, row, table and body', () => {
		expect(FALLBACK_FOOTER).to.equal('</p></td>  </tr> </table></body>')
	})

	it('standaloneHeader is the full document opening with the title, html without lang', () => {
		expect(standaloneHeader('My Title')).to.equal(
			DOCTYPE + '<html xmlns="http://www.w3.org/1999/xhtml">' + HEAD_OPEN + 'My Title' + AFTER_TITLE
		)
	})

	it('standaloneHeader escapes the title so it cannot close the title element', () => {
		const html = standaloneHeader('</title><script>alert(1)</script> & "q"')
		expect(html).to.contain('<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;</title>')
		expect(html).to.not.contain('<script>')
	})

	it('orFallback returns the custom fragment when it is not empty', () => {
		expect(orFallback('<h1>', 'fallback')).to.equal('<h1>')
	})

	it('orFallback returns the fallback for the empty string', () => {
		expect(orFallback('', 'fallback')).to.equal('fallback')
	})
})
