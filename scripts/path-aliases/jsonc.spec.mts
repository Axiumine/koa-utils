import fs from 'node:fs'
import path from 'node:path'

import { expect } from 'chai'

import { parseJsonc } from './jsonc.mts'

describe('parseJsonc', () => {
	it('reads plain JSON as JSON.parse does', () => {
		expect(parseJsonc('{"a": [1, 2, {"b": null}], "c": "d"}')).to.deep.equal({ a: [1, 2, { b: null }], c: 'd' })
	})

	it('drops line and block comments, wherever they sit', () => {
		const text = `/* head */ {\n\t// a line\n\t"a": 1, /* inline */ "b": 2 // tail\n\t/* multi\n\tline */\n}`
		expect(parseJsonc(text)).to.deep.equal({ a: 1, b: 2 })
	})

	it('drops a trailing comma in an array and in an object, even across a comment', () => {
		expect(parseJsonc('{"a": [1, 2,\n], "b": {"c": 3, // last\n},}')).to.deep.equal({ a: [1, 2], b: { c: 3 } })
	})

	it('keeps comment markers and brackets that sit inside a string', () => {
		const text = `{"glob": "./src/*", "url": "http://x/*y*/", "tricky": "a,]", "tail": "b,}", "quote": "say \\"//\\" now"}`
		expect(parseJsonc(text)).to.deep.equal({
			glob: './src/*',
			url: 'http://x/*y*/',
			tricky: 'a,]',
			tail: 'b,}',
			quote: 'say "//" now'
		})
	})

	it('throws on text that is still not JSON, an unclosed comment included', () => {
		expect(() => parseJsonc('{"a": 1')).to.throw()
		expect(() => parseJsonc('{"a": 1 /* never closed }')).to.throw()
	})

	it('reads the real tsconfig.json, whose paths hold `/*` and which has both comment styles and a trailing comma', () => {
		const text = fs.readFileSync(path.resolve(import.meta.dirname, '../../tsconfig.json'), 'utf8')
		const options = (parseJsonc(text) as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions
		expect(options.paths['@lib/*']).to.deep.equal(['./src/lib/*'])
	})
})
