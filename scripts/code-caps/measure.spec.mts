import { expect } from 'chai'

import {
	countCodeLines,
	describeDiagnostic,
	FILE_SYMBOL,
	LIMITS,
	measureSource,
	syntaxErrors,
	type Measurement
} from './measure.mts'

const lines = (count: number, make: (i: number) => string = (i) => `const v${i} = ${i}`): string =>
	Array.from({ length: count }, (_, i) => make(i)).join('\n')

const measure = (text: string): Measurement[] => measureSource('x.mts', text)
const bySymbol = (found: Measurement[], cap: Measurement['cap']): Record<string, number> =>
	Object.fromEntries(found.filter((m) => m.cap === cap).map((m) => [m.symbol, m.value]))

// body of `count` code lines inside a function declared as `head`
const fn = (head: string, count: number): string => `${head} {\n${lines(count - 2, (i) => `\tvoid ${i}`)}\n}`

describe('measureSource: file lines', () => {
	it('flags a file above 500 code lines, with the file symbol', () => {
		expect(measure(lines(501))).to.deep.equal([{ cap: 'file-lines', path: 'x.mts', symbol: FILE_SYMBOL, value: 501 }])
	})

	it('tolerates exactly 500 code lines', () => {
		expect(measure(lines(500))).to.deep.equal([])
	})

	it('ignores blank lines and comment-only lines, including JSDoc and block comments', () => {
		const text = `${lines(300)}\n\n${lines(300, (i) => `// note ${i}`)}\n/**\n * doc\n */\n/* a\n b */\n`
		expect(measure(text)).to.deep.equal([])
	})

	it('counts every line of a multi-line template literal, even ones that look blank', () => {
		const text = `${lines(250)}\nconst t = \`\n${lines(250, () => 'text')}\n\n\``
		const found = measure(text)
		expect(found).to.have.length(1)
		expect(found[0]?.value).to.equal(503)
	})

	it('counts a line once however many tokens it holds', () => {
		expect(measure(`${lines(499)}\nconst a = 1; const b = 2; const c = 3`)).to.deep.equal([])
	})
})

describe('measureSource: function lines', () => {
	it('flags a function above 50 code lines and tolerates exactly 50', () => {
		expect(bySymbol(measure(fn('function big()', 51)), 'fn-lines')).to.deep.equal({ big: 51 })
		expect(measure(fn('function ok()', 50))).to.deep.equal([])
	})

	it('does not count comment or blank lines inside a function', () => {
		const body = lines(40, (i) => `\tvoid ${i}`)
		const comments = lines(40, (i) => `\t// c${i}`)
		expect(measure(`function f() {\n${body}\n\n${comments}\n}`)).to.deep.equal([])
	})

	it('measures arrow, method, constructor, getter, setter and function expressions', () => {
		const body = lines(60, (i) => `\t\tvoid ${i}`)
		const text = [
			`const arrow = () => {\n${body}\n}`,
			`class K {\n\tmethod() {\n${body}\n\t}`,
			`\tconstructor() {\n${body}\n\t}`,
			`\tget value() {\n${body}\n\t\treturn 1\n\t}`,
			`\tset value(v: number) {\n${body}\n\t}\n}`,
			`const named = function inner() {\n${body}\n}`
		].join('\n')
		expect(Object.keys(bySymbol(measure(text), 'fn-lines'))).to.have.members([
			'arrow',
			'K>method',
			'K>constructor',
			'K>get:value',
			'K>set:value',
			'inner'
		])
	})

	it('measures the span of a bodyless overload signature without crashing', () => {
		const text = `class K {\n\tm(a: string): void\n\tm(a: number): void\n\tm(a: any) {}\n}`
		expect(measure(text)).to.deep.equal([])
	})
})

describe('measureSource: symbol names', () => {
	// `head` + a 60-line block + `tail`: always above the 50 line function cap
	const big = (head: string, tail = ''): string => `${head}{\n${lines(60, (i) => `void ${i}`)}\n}${tail}`

	it('names anonymous functions after the assignment target', () => {
		const text = [
			big('const a = () => '),
			big('const o = { p: function () ', ' }'),
			big('class H { prop = () => ', ' }'),
			big('target.slot = () => '),
			big('const wrapped = (() => ', ') as unknown')
		].join('\n')
		expect(Object.keys(bySymbol(measure(text), 'fn-lines'))).to.have.members(['a', 'p', 'H>prop', 'target.slot', 'wrapped'])
	})

	it('names a function passed as an argument after its callee', () => {
		const found = bySymbol(measure(`${big('describe(() => ', ')')}`), 'fn-lines')
		expect(Object.keys(found)).to.deep.equal(['arg(describe)'])
	})

	it('falls back to anon when nothing names the function', () => {
		const found = bySymbol(measure(`(function () {\n${lines(60, (i) => `void ${i}`)}\n})()`), 'fn-lines')
		expect(Object.keys(found)).to.deep.equal(['anon'])
	})

	it('names classes: declaration, expression via variable, anonymous default', () => {
		const body = lines(310, (i) => `\tprop${i} = ${i}`)
		const found = bySymbol(
			measure(`class A {\n${body}\n}\nconst B = class {\n${body}\n}\nexport default class {\n${body}\n}`),
			'class-lines'
		)
		expect(Object.keys(found)).to.have.members(['A', 'B', 'anon'])
	})

	it('joins nested symbols with > and suffixes duplicates by source order', () => {
		const text = [
			big('function twin() ', ''),
			big('function twin() ', ''),
			`function outer() {\n\tfunction twin() {\n${lines(60, (i) => `\t\tvoid ${i}`)}\n\t}\n}`
		].join('\n')
		expect(Object.keys(bySymbol(measure(text), 'fn-lines'))).to.have.members(['twin', 'twin#2', 'outer', 'outer>twin'])
	})

	it('keeps one counter per path across caps', () => {
		const text = `function g(a, b, c, d, e) {\n${lines(60, (i) => `\tvoid ${i}`)}\n}\nfunction g(a, b, c, d, e) {}`
		const found = measure(text)
		expect(found.map((m) => `${m.cap}:${m.symbol}`)).to.have.members(['fn-lines:g', 'params:g', 'params:g#2'])
	})
})

describe('measureSource: params', () => {
	it('flags more than 4 parameters and tolerates 4', () => {
		expect(bySymbol(measure('function f(a, b, c, d, e) {}'), 'params')).to.deep.equal({ f: 5 })
		expect(measure('function f(a, b, c, d) {}')).to.deep.equal([])
	})

	it('does not count a this parameter, counts a destructured object as one', () => {
		expect(measure('function f(this: unknown, a, b, c, d) {}')).to.deep.equal([])
		expect(measure('function f({ a, b, c }, [d, e], g, h) {}')).to.deep.equal([])
	})

	it('counts constructor parameter properties', () => {
		expect(bySymbol(measure('class K { constructor(a, b, c, d, e) {} }'), 'params')).to.deep.equal({ 'K>constructor': 5 })
	})
})

describe('measureSource: nesting', () => {
	const nest = (open: string[], close = '}'): string =>
		`function f(x) {\n${open.join('\n')}\nvoid 1\n${open.map(() => close).join('\n')}\n}`

	it('flags depth above 4 and tolerates 4', () => {
		const ifs = (n: number): string[] => Array.from({ length: n }, () => 'if (x) {')
		expect(bySymbol(measure(nest(ifs(5))), 'nesting')).to.deep.equal({ f: 5 })
		expect(measure(nest(ifs(4)))).to.deep.equal([])
	})

	it('counts for, for-in, for-of, while, do, switch and try as one level each', () => {
		const text = nest(['for (;;) {', 'for (const k in x) {', 'for (const v of x) {', 'while (x) {', 'try {'])
		expect(bySymbol(measure(text), 'nesting')).to.deep.equal({ f: 5 })
		const sw = 'function s(x) {\nswitch (x) {\ncase 1: {\nif (x) {\nif (x) {\nvoid 1\n}\n}\n}\n}\n}'
		expect(measure(sw)).to.deep.equal([])
		const doWhile =
			'function d(x) {\ndo {\ndo {\ndo {\ndo {\ndo {\nvoid 1\n} while (x)\n} while (x)\n} while (x)\n} while (x)\n} while (x)\n}'
		expect(bySymbol(measure(doWhile), 'nesting')).to.deep.equal({ d: 5 })
	})

	it('keeps an else-if chain on the level of the first if', () => {
		const chain =
			'function c(x) {\nif (x) {\nvoid 1\n} else if (x) {\nvoid 2\n} else if (x) {\nvoid 3\n} else if (x) {\nvoid 4\n} else if (x) {\nvoid 5\n} else {\nvoid 6\n}\n}'
		expect(measure(chain)).to.deep.equal([])
	})

	it('nests an if inside an else-if branch one level deeper', () => {
		const text = 'function c(x) {\nif (x) {\n} else if (x) {\nif (x) {\nif (x) {\nif (x) {\nif (x) {\nvoid 1\n}\n}\n}\n}\n}\n}'
		expect(bySymbol(measure(text), 'nesting')).to.deep.equal({ c: 5 })
	})

	it('does not count ternaries, and nested functions and classes are their own entries', () => {
		const text = 'function t(x) {\nreturn x ? (x ? (x ? (x ? (x ? 1 : 2) : 3) : 4) : 5) : 6\n}'
		expect(measure(text)).to.deep.equal([])
	})

	it('does not add a nested function or class to the depth of its parent', () => {
		const ifs = (n: number): string => 'if (x) {\n'.repeat(n)
		const close = (n: number): string => '}\n'.repeat(n)
		const text = `function o(x) {\n${ifs(3)}const f = () => {\n${ifs(3)}void 1\n${close(3)}}\nclass Z {\nm() {\n${ifs(3)}void 2\n${close(3)}}\n}\n${close(3)}}`
		expect(measure(text)).to.deep.equal([])
	})
})

describe('LIMITS', () => {
	it('holds the agreed caps', () => {
		expect(LIMITS).to.deep.equal({ 'file-lines': 500, 'fn-lines': 50, 'class-lines': 300, params: 4, nesting: 4 })
	})
})

describe('measureSource: exact values and boundaries', () => {
	const cls = (total: number): string => `class A {\n${lines(total - 2, (i) => `\tp${i} = ${i}`)}\n}`

	it('ignores the end-of-file token: a trailing newline adds no line', () => {
		expect(measure(`${lines(500)}\n`)).to.deep.equal([])
		expect(measure(`${lines(501)}\n`)[0]?.value).to.equal(501)
		expect(measure(`${lines(501)}\n\n\n// tail\n`)[0]?.value).to.equal(501)
	})

	it('reports the exact class size and flips at 300/301', () => {
		expect(measure(cls(300))).to.deep.equal([])
		expect(measure(cls(301))).to.deep.equal([{ cap: 'class-lines', path: 'x.mts', symbol: 'A', value: 301 }])
		expect(bySymbol(measure(cls(320)), 'class-lines')).to.deep.equal({ A: 320 })
	})

	it('reports the exact function size', () => {
		expect(bySymbol(measure(fn('function big()', 77)), 'fn-lines')).to.deep.equal({ big: 77 })
	})

	it('does not count the lines of an attached JSDoc comment', () => {
		const doc = `/**\n${lines(30, (i) => ` * line ${i}`)}\n */`
		expect(measure(`${lines(490)}\n${doc}\nfunction f() {}`)).to.deep.equal([])
		const inner = `function o() {\n${lines(40, (i) => `\tvoid ${i}`)}\n\t${doc}\n\tfunction i() {}\n}`
		expect(measure(inner)).to.deep.equal([])
		expect(measure(`${doc}\nconst v = 1\n${doc}\nexport class K {\n${doc}\n\tm = 1\n}`)).to.deep.equal([])
	})

	it('parses a .mts source as TypeScript: type annotations and angle-bracket assertions', () => {
		const text = `function f(a: number): number {\n${lines(60, (i) => `\tvoid ${i}`)}\n\treturn <number>a\n}\nfunction g<T,>(a: T, b: Array<T>) {\n${lines(60, (i) => `\tvoid ${i}`)}\n}`
		expect(measure(text)).to.deep.equal([
			{ cap: 'fn-lines', path: 'x.mts', symbol: 'f', value: 63 },
			{ cap: 'fn-lines', path: 'x.mts', symbol: 'g', value: 62 }
		])
	})
})

describe('measureSource: code line count', () => {
	it('is 0 for an empty file and for a file holding only comments', () => {
		expect(countCodeLines('x.mts', '')).to.equal(0)
		expect(countCodeLines('x.mts', '// a\n/* b\n c */\n')).to.equal(0)
		expect(countCodeLines('x.mts', '\n\n   \n')).to.equal(0)
	})

	it('counts code lines exactly, with or without a trailing newline', () => {
		expect(countCodeLines('x.mts', 'export const a = 1')).to.equal(1)
		expect(countCodeLines('x.mts', 'export const a = 1\n')).to.equal(1)
		expect(countCodeLines('x.mts', '// head\nconst a = 1\n\n/* c */ const b = 2 // t\n')).to.equal(2)
	})
})

describe('measureSource: nesting edge cases', () => {
	const ifs = (n: number): string => 'if (x) {\n'.repeat(n)
	const close = (n: number): string => '}\n'.repeat(n)

	it('counts a deep then-branch of an if that has an else-if', () => {
		const text = `function f(x) {\n${ifs(5)}void 1\n${close(5)} else if (y) {\nvoid 2\n}\n}`
		expect(bySymbol(measure(text), 'nesting')).to.deep.equal({ f: 5 })
		const cond = `function g(x) {\nif (x) {\n${ifs(3)}void 1\n${close(3)}} else if (y) {\nvoid 2\n}\n}`
		expect(measure(cond)).to.deep.equal([])
	})

	it('keeps the deepest level when a shallower sibling follows', () => {
		const text = `function f(x) {\n${ifs(5)}void 1\n${close(5)}if (x) {\nvoid 2\n}\nif (x) {\nvoid 3\n}\n}`
		expect(bySymbol(measure(text), 'nesting')).to.deep.equal({ f: 5 })
	})

	it('counts a switch as a level', () => {
		const text = `function f(x) {\nswitch (x) {\ncase 1:\n${ifs(4)}void 1\n${close(4)}}\n}`
		expect(bySymbol(measure(text), 'nesting')).to.deep.equal({ f: 5 })
		const four = `function g(x) {\nswitch (x) {\ncase 1:\n${ifs(3)}void 1\n${close(3)}}\n}`
		expect(measure(four)).to.deep.equal([])
	})

	it('measures a class static block as its own unit', () => {
		const text = `class K {\nstatic {\n${ifs(5)}void 1\n${close(5)}}\nm() {\n${ifs(4)}void 2\n${close(4)}}\n}`
		expect(measure(text)).to.deep.equal([{ cap: 'nesting', path: 'x.mts', symbol: 'K>static', value: 5 }])
	})

	it('caps the lines of a static block, numbers duplicates, and gives it no params', () => {
		const text = `class K {\nstatic {\n${lines(60, (i) => `void ${i}`)}\n}\nstatic {\n${lines(60, (i) => `void ${i}`)}\n}\n}`
		expect(measure(text).map((m) => `${m.cap}:${m.symbol}:${m.value}`)).to.deep.equal([
			'fn-lines:K>static:62',
			'fn-lines:K>static#2:62'
		])
	})

	it('does not add a function inside a static block to the block depth', () => {
		const text = `class K {\nstatic {\n${ifs(3)}const f = () => {\n${ifs(3)}void 1\n${close(3)}}\n${close(3)}}\n}`
		expect(measure(text)).to.deep.equal([])
	})
})

describe('measureSource: names through wrappers', () => {
	const body = (): string => `{\n${lines(60, (i) => `void ${i}`)}\n}`

	it('sees through satisfies, non-null, as and parentheses around a function expression', () => {
		const text = [
			`const sat = (function () ${body()}) satisfies unknown`,
			`const bang = (() => ${body()})!`,
			`const cast = (() => ${body()}) as unknown`,
			`const plain = (() => ${body()})`,
			`const nested = ((() => ${body()}) satisfies unknown)!`
		].join('\n')
		expect(Object.keys(bySymbol(measure(text), 'fn-lines'))).to.have.members(['sat', 'bang', 'cast', 'plain', 'nested'])
	})
})

describe('measureSource: names that are not assignments', () => {
	const body = (): string => `{\n${lines(60, (i) => `void ${i}`)}\n}`

	it('does not name a function after the left side of a non-assignment binary expression', () => {
		const text = `const v = left || function () ${body()}\nconst w = left ?? (() => ${body()})`
		expect(Object.keys(bySymbol(measure(text), 'fn-lines'))).to.deep.equal(['anon', 'anon#2'])
	})

	it('does not name a function after a parameter whose default it is', () => {
		const text = `function g(cb = () => ${body()}) {}`
		expect(Object.keys(bySymbol(measure(text), 'fn-lines'))).to.deep.equal(['g', 'g>anon'])
	})
})

describe('syntaxErrors', () => {
	it('is empty for valid TypeScript', () => {
		expect(syntaxErrors('ok.mts', 'export function f(a: number): number {\n\treturn a\n}\n')).to.deep.equal([])
	})

	it('reports file, line, column and message for a file that does not parse', () => {
		const text = 'export function ok() { return 1 }\nexport function broken( {\n  if (\n'
		const found = syntaxErrors('src/bad.mts', text)
		expect(found.length).to.be.greaterThan(0)
		expect(found[0]).to.equal("src/bad.mts:3:6: syntax error: ':' expected.")
	})

	it('describes a diagnostic without a position by the bare path', () => {
		expect(describeDiagnostic('p.mts', { file: undefined, start: undefined, messageText: 'boom' })).to.equal(
			'p.mts: syntax error: boom'
		)
	})

	it('describes a diagnostic that has a file but no start by the bare path', () => {
		const file = { getLineAndCharacterOfPosition: () => ({ line: 0, character: 0 }) } as never
		expect(describeDiagnostic('p.mts', { file, start: undefined, messageText: 'x' })).to.equal('p.mts: syntax error: x')
		expect(describeDiagnostic('p.mts', { file, start: 0, messageText: 'x' })).to.equal('p.mts:1:1: syntax error: x')
	})
})
