import { expect } from 'chai'

import { scanSpecifiers } from './scan.mts'

const bodies = (text: string): string[] => scanSpecifiers(text).map((specifier) => specifier.body)

describe('scanSpecifiers: finds the module specifier of', () => {
	it('a static import, in both quote styles', () => {
		expect(bodies(`import { a } from '@lib/a.mjs'\nimport b from "@lib/b.mjs"\n`)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs'])
	})

	it('an import whose braces span several lines', () => {
		expect(bodies(`import {\n\ta,\n\tb\n} from '@lib/x.mjs'\n`)).to.deep.equal(['@lib/x.mjs'])
	})

	it('type-only, namespace and default-plus-named imports', () => {
		const text = `import type { A } from '@lib/a.mjs'; import * as ns from '@lib/b.mjs'; import d, { e } from '@lib/c.mjs'`
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs', '@lib/c.mjs'])
	})

	it('every export-from form, even one that renames a binding to `from`', () => {
		const text = [
			`export * from '@lib/a.mjs'`,
			`export * as ns from '@lib/b.mjs'`,
			`export { x as from } from '@lib/c.mjs'`,
			`export type { T } from '@lib/d.mjs'`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs', '@lib/c.mjs', '@lib/d.mjs'])
	})

	it('a side-effect import', () => {
		expect(bodies(`import '@lib/side.mjs'`)).to.deep.equal(['@lib/side.mjs'])
	})

	it('a dynamic import, awaited or not, and one with import attributes', () => {
		const text = [
			`const a = await import('@lib/a.mjs')`,
			`import("@lib/b.mjs").then(use)`,
			`import('@lib/c.mjs', { with: { type: 'json' } })`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs', '@lib/c.mjs'])
	})

	it('the import types of a declaration file', () => {
		const text = [
			`export declare const x: typeof import("@lib/a.mjs").x;`,
			`export type T = import('@lib/b.mjs').T<string>;`,
			`export declare const m: import("mongoose").Model<unknown>;`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs', 'mongoose'])
	})

	it('an import inside a template substitution, which is code', () => {
		expect(bodies('const t = `x ${await import("@lib/a.mjs")} y`')).to.deep.equal(['@lib/a.mjs'])
	})

	it('and reports where the literal starts and ends, quotes included', () => {
		const text = `import a from '@lib/a.mjs';`
		const [only] = scanSpecifiers(text)
		expect(only).to.deep.equal({ start: 14, end: 26, body: '@lib/a.mjs' })
		expect(text.slice(only?.start, only?.end)).to.equal(`'@lib/a.mjs'`)
	})
})

describe('scanSpecifiers: leaves the same text alone when it is not a specifier', () => {
	it('an ordinary string, an argument, an object value, a `from` call', () => {
		const text = [
			`const a = '@lib/a.mjs'`,
			`call('@lib/b.mjs')`,
			`const o = { from: '@lib/c.mjs', import: '@lib/d.mjs' }`,
			`Array.from('@lib/e.mjs')`
		].join('\n')
		expect(bodies(text)).to.deep.equal([])
	})

	it('a string that spells the word `from` is not the keyword', () => {
		expect(bodies(`x('from' '@lib/a.mjs')`)).to.deep.equal([])
	})

	it('a method called import, reached with . or ?.', () => {
		expect(bodies(`loader.import('@lib/a.mjs')\nloader?.import('@lib/b.mjs')`)).to.deep.equal([])
	})

	it('a computed dynamic import', () => {
		expect(bodies("import('@lib/' + name)\nimport(`@lib/${name}`)")).to.deep.equal([])
	})

	it('line comments, block comments and JSDoc', () => {
		const text = [
			`// import x from '@lib/a.mjs'`,
			`/* import('@lib/b.mjs') */`,
			`/**\n * @example import { x } from '@lib/c.mjs'\n */`,
			`import real from '@lib/real.mjs'`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/real.mjs'])
	})

	it('template text, however nested', () => {
		const text = [
			"const t = `import x from '@lib/a.mjs'`",
			"const n = `a ${ `b ${ { k: 1 }.k } c` } from '@lib/b.mjs'`",
			`import real from '@lib/real.mjs'`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/real.mjs'])
	})

	it('an escaped quote does not end a string early', () => {
		expect(bodies(`const s = 'it\\'s from "x"'\nimport real from '@lib/real.mjs'`)).to.deep.equal(['@lib/real.mjs'])
	})
})

describe('scanSpecifiers: reads a regex literal as one token and a division as an operator', () => {
	it('a regex that holds quotes, a slash in a class, an escaped slash and flags', () => {
		const text = [
			`const a = /['"]/g`,
			`const b = /[/'"]/`,
			`const c = /a\\/'b/i`,
			`const d = await import('@lib/real.mjs')`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/real.mjs'])
	})

	it('a regex at the start of the file, after `(`, `=` and a keyword', () => {
		const text = [
			`/"/.test(a)`,
			`x.test(/"/)`,
			`const r = /"/`,
			`function f(x) { return /'/.test(x) }`,
			`import('@lib/real.mjs')`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/real.mjs'])
	})

	it('a division after a word, a number or a non-ASCII name: the line is not swallowed as a regex', () => {
		const text = [
			`n = a / b; m = import('@lib/a.mjs'); k = c / d`,
			`n = 2 / 3; m = import('@lib/b.mjs'); k = 4 / 5`,
			`const é = 1; n = é / 2; m = import('@lib/c.mjs'); k = é / 3`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs', '@lib/c.mjs'])
	})

	it('a division after `)`, `]` and `}`', () => {
		const text = [
			`n = f(a) / 2; m = import('@lib/a.mjs'); k = g(b) / 3`,
			`n = a[0] / 2; m = import('@lib/b.mjs'); k = c[1] / 3`,
			`{ } / 2; m = import('@lib/c.mjs'); k = 3 / 4`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs', '@lib/c.mjs'])
	})

	it('a division after a string or a template', () => {
		const text = [
			"n = 'a' / 2; m = import('@lib/a.mjs'); k = 'b' / 3",
			'n = `a` / 2; m = import("@lib/b.mjs"); k = `b` / 3'
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/b.mjs'])
	})

	it('a lone slash where a regex could start but none closes on the line', () => {
		expect(bodies(`x = / y\nimport('@lib/a.mjs')`)).to.deep.equal(['@lib/a.mjs'])
	})
})

describe('scanSpecifiers: braces, templates and malformed text', () => {
	it('tracks braces inside a template substitution and plain blocks outside one', () => {
		const text = [
			'const t = `${ { a: { b: 1 } }.a.b } and ${ 2 }`',
			`if (ok) { import('@lib/a.mjs') }`,
			`import real from '@lib/real.mjs'`
		].join('\n')
		expect(bodies(text)).to.deep.equal(['@lib/a.mjs', '@lib/real.mjs'])
	})

	it('treats an unterminated block comment as running to the end', () => {
		expect(bodies(`import a from '@lib/a.mjs'\n/* never closed\nimport b from '@lib/b.mjs'`)).to.deep.equal(['@lib/a.mjs'])
	})

	it('ends the scan on an unterminated template, with or without a trailing backslash', () => {
		expect(bodies('import a from "@lib/a.mjs"\nconst t = `never closed')).to.deep.equal(['@lib/a.mjs'])
		expect(bodies('import a from "@lib/a.mjs"\nconst t = `never closed\\')).to.deep.equal(['@lib/a.mjs'])
	})

	it('throws on an unterminated string rather than guess where code resumes', () => {
		expect(() => scanSpecifiers(`const a = 'oops\nimport b from '@lib/b.mjs'`)).to.throw(
			'unterminated string literal at offset 10'
		)
		expect(() => scanSpecifiers(`const a = "oops`)).to.throw('unterminated string literal at offset 10')
	})

	it('finds nothing in an empty text', () => {
		expect(scanSpecifiers('')).to.deep.equal([])
	})
})
