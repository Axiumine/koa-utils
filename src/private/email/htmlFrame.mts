import { escapeHtml } from './escapeHtml.mjs'

const DOCTYPE =
	'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
const HEAD_OPEN = ' <head>' + '  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' + '  <title>'

/** Fallback header, first half: everything up to the opening `<title>` tag. */
export const FALLBACK_HEADER_1 = DOCTYPE + '<html lang="en" xmlns="http://www.w3.org/1999/xhtml">' + HEAD_OPEN

/** Fallback header, second half: from `</title>` to the opening of the content paragraph. */
export const FALLBACK_HEADER_2 =
	'</title>' +
	'  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
	'</head>' +
	'</html>' +
	'<body style="margin: 0; padding: 0;">' +
	' <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">' +
	'  <tr>' +
	'   <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;"><p style="color: #000000; font-family: Verdana, sans-serif; font-size: 12pt;">'

/** Fallback footer: closes the paragraph, cell, row, table and body the header opened. */
export const FALLBACK_FOOTER = '</p></td>' + '  </tr>' + ' </table>' + '</body>'

/** Standalone header for the legacy mails that build a full document; `title` is escaped. */
export function standaloneHeader(title: string): string {
	return DOCTYPE + '<html xmlns="http://www.w3.org/1999/xhtml">' + HEAD_OPEN + escapeHtml(title) + FALLBACK_HEADER_2
}

/** A custom fragment from the constructor, or the fallback when none was given. */
export function orFallback(custom: string, fallback: string): string {
	return custom === '' ? fallback : custom
}
