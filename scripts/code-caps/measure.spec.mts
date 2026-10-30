import { expect } from 'chai'

import { FILE_SYMBOL, LIMITS, measureSource, type Measurement } from './measure.mts'

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
