import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import type { IArrayParser } from '@lib/PostgreSQL/parse/IArrayParser.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'

// One element: a double-quoted string with `\"` and `\\` escapes (group 1 holds its text between the quotes), or a run of
// characters without a comma, brace, quote, backslash or white space (group 1 absent). Sticky, so it matches exactly at
// `lastIndex`.
const ELEMENT = /"((?:[^"\\]|\\[\s\S])*)"|[^,{}"\\\s]+/y
const ESCAPE = /\\([\s\S])/g

interface IScanned {
	readonly value: string | null
	/** The index just after the element. */
	readonly next: number
}

// The element that starts at `from`, or undefined when none does. An unquoted `NULL`, in any case, is the null value.
function scanElement(inner: string, from: number): IScanned | undefined {
	ELEMENT.lastIndex = from
	const match = ELEMENT.exec(inner)
	if (match === null) return undefined
	const quoted = match[1]
	if (quoted !== undefined) return { value: quoted.replace(ESCAPE, '$1'), next: ELEMENT.lastIndex }
	return { value: match[0].toUpperCase() === 'NULL' ? null : match[0], next: ELEMENT.lastIndex }
}

// Splits the text of a one-dimensional array into its elements. The grammar is the one the server prints: `{}` or
// `{e1,e2,...}`. A second dimension (`{{1,2},{3,4}}`), a dimension prefix (`[0:1]={...}`) and anything after the closing
// brace are `MALFORMED`: a parser that guessed would hand the caller a wrong shape.
function splitArray(text: string, typeName: string): (string | null)[] {
	if (!text.startsWith('{') || !text.endsWith('}')) throw new DbParseError('MALFORMED', typeName)
	const inner = text.slice(1, -1)
	const elements: (string | null)[] = []
	if (inner === '') return elements
	let at = 0
	for (;;) {
		const element = scanElement(inner, at)
		if (element === undefined) throw new DbParseError('MALFORMED', typeName)
		elements.push(element.value)
		if (element.next === inner.length) return elements
		// Anything but a comma after an element (a space, a brace, a quote) is not the grammar.
		if (inner.charAt(element.next) !== ',') throw new DbParseError('MALFORMED', typeName)
		// Past the comma.
		at = element.next + 1
	}
}

/**
 * The parser of an array type: each element goes through `element`, a `NULL` stays `null`. `typeName` (`date[]`, ...)
 * is the name the error carries. Only one-dimensional arrays are read; anything else is `MALFORMED`.
 */
export function arrayOf(element: IStringParser, typeName: string): IArrayParser {
	return (text) => splitArray(text, typeName).map((item) => (item === null ? null : element(item)))
}
