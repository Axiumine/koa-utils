// Finds the module specifiers in emitted JavaScript (`.mjs`) and declaration (`.d.mts`) text, without a parser.
//
// A specifier is the string literal of `import ... from '…'`, `export ... from '…'`, a side-effect `import '…'`, a dynamic
// `import('…')` and the `import('…')` type of a declaration file. Nothing else qualifies: the same characters inside a
// comment, a JSDoc block, a template literal or any other string are skipped, because the scanner lexes the text first.
// It knows just enough JavaScript to do that: comments, strings, templates with `${}` substitutions, regex literals.
//
// Why not the TypeScript API: this runs inside the build, and the build must not depend on the compiler's JS API.

export interface Specifier {
	// Offset of the opening quote.
	start: number
	// Offset just after the closing quote.
	end: number
	// The text between the quotes, as written.
	body: string
}

interface State {
	text: string
	pos: number
	// The last three significant tokens, oldest first.
	history: string[]
	// One counter per open `${` substitution: the `{` still unclosed inside it.
	substitutions: { depth: number }[]
	found: Specifier[]
}

type Handler = (state: State, match: RegExpExecArray) => void

// Stand-ins for tokens whose text does not matter. None of them can equal a word or a punctuator.
const STRING = '"'
const TEMPLATE = '`'
const REGEX = '/re/'

// One sticky pattern, one named group per lexical class, tried in this order at the cursor. `other` takes any single
// character, so the scanner always advances. The string patterns are unrolled loops: linear time, no nested quantifier.
const CLASSES = {
	skip: String.raw`\s+|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`,
	string: String.raw`'[^'\\\n]*(?:\\[\s\S][^'\\\n]*)*'|"[^"\\\n]*(?:\\[\s\S][^"\\\n]*)*"`,
	broken: String.raw`['"]`,
	template: '`',
	word: String.raw`[\w$\u0080-￿]+`,
	regex: String.raw`\/(?:[^\/\\\[\n]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[A-Za-z]*`,
	other: String.raw`[\s\S]`
}

function lexer(withRegex: boolean): RegExp {
	const names = Object.keys(CLASSES).filter((name) => withRegex || name !== 'regex') as (keyof typeof CLASSES)[]
	return new RegExp(names.map((name) => `(?<${name}>${CLASSES[name]})`).join('|'), 'y')
}

const WITH_REGEX = lexer(true)
const WITHOUT_REGEX = lexer(false)

// What follows a `/` decides whether it opens a regex literal or divides. After a value it divides; after anything else
// it starts a regex. `)` and `}` are read as the end of a value: a regex right after them is rare, division is not.
const VALUE_ENDS = new Set([')', ']', '}', STRING, TEMPLATE, REGEX])
const KEYWORDS_BEFORE_REGEX = new Set([
	'return',
	'typeof',
	'instanceof',
	'in',
	'of',
	'new',
	'delete',
	'void',
	'throw',
	'case',
	'do',
	'else',
	'yield',
	'await'
])
const WORD_START = /^[\w$\u0080-￿]/

function regexAllowed(previous: string | undefined): boolean {
	if (previous === undefined) {
		return true
	}
	return WORD_START.test(previous) ? KEYWORDS_BEFORE_REGEX.has(previous) : !VALUE_ENDS.has(previous)
}

// Template text up to the closing backtick or the next `${`. Total on purpose: it matches at any offset, even a stray
// trailing backslash, so a malformed file ends the scan instead of crashing it.
const TEMPLATE_TEXT = /[^`\\$]*(?:(?:\\[\s\S]|\$(?!\{))[^`\\$]*)*(`|\$\{|$|\\$)/y
const CALL_END = /\s*[),]/y

function continueTemplate(state: State): number {
	TEMPLATE_TEXT.lastIndex = state.pos
	const match = TEMPLATE_TEXT.exec(state.text) as RegExpExecArray
	if (match[1] === '${') {
		state.substitutions.push({ depth: 0 })
	}
	return TEMPLATE_TEXT.lastIndex
}

function remember(state: State, token: string): void {
	state.history.push(token)
	if (state.history.length > 3) {
		state.history.shift()
	}
}

// `from '…'`, a side-effect `import '…'`, or `import('…'`. A property named `import` (`x.import('…')`) is not an import.
function isSpecifierPosition(history: readonly string[], text: string, end: number): boolean {
	const [third, second, last] = [history.at(-3), history.at(-2), history.at(-1)]
	if (last === 'from') {
		return true
	}
	if (last === 'import') {
		return second !== '.'
	}
	CALL_END.lastIndex = end
	return last === '(' && second === 'import' && third !== '.' && CALL_END.test(text)
}

function onString(state: State, match: RegExpExecArray): void {
	const start = match.index
	const end = start + match[0].length
	if (isSpecifierPosition(state.history, state.text, end)) {
		state.found.push({ start, end, body: match[0].slice(1, -1) })
	}
	remember(state, STRING)
}

function onTemplate(state: State): void {
	state.pos = continueTemplate(state)
	remember(state, TEMPLATE)
}

function onOpenBrace(state: State, token: string): void {
	const open = state.substitutions.at(-1)
	if (open !== undefined) {
		open.depth++
	}
	remember(state, token)
}

// A `}` that closes a `${` substitution hands the scan back to the template text.
function onCloseBrace(state: State, token: string): void {
	const open = state.substitutions.at(-1)
	if (open === undefined) {
		remember(state, token)
	} else if (open.depth > 0) {
		open.depth--
		remember(state, token)
	} else {
		state.substitutions.pop()
		onTemplate(state)
	}
}

const PUNCTUATORS: Record<string, (state: State, token: string) => void> = { '{': onOpenBrace, '}': onCloseBrace }

const HANDLERS: Record<string, Handler> = {
	skip: () => undefined,
	string: onString,
	broken: (_state, match) => {
		throw new Error(`unterminated string literal at offset ${match.index}`)
	},
	template: onTemplate,
	word: (state, match) => remember(state, match[0]),
	regex: (state) => remember(state, REGEX),
	other: (state, match) => (PUNCTUATORS[match[0]] ?? remember)(state, match[0])
}

function step(state: State): void {
	const lex = regexAllowed(state.history.at(-1)) ? WITH_REGEX : WITHOUT_REGEX
	lex.lastIndex = state.pos
	const match = lex.exec(state.text) as RegExpExecArray
	state.pos = lex.lastIndex
	const groups = match.groups as Record<string, string | undefined>
	const matched = Object.keys(groups).find((name) => groups[name] !== undefined) as string
	const handle = HANDLERS[matched] as Handler
	handle(state, match)
}

export function scanSpecifiers(text: string): Specifier[] {
	const state: State = { text, pos: 0, history: [], substitutions: [], found: [] }
	while (state.pos < text.length) {
		step(state)
	}
	return state.found
}
