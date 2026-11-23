import { expect } from 'chai'

import { relativeSpecifier, rewriteAliasSpecifiers, type Alias } from './rewrite.mts'

const ALIASES: Alias[] = [
	{ prefix: '@lib/', dir: '/out/lib' },
	{ prefix: '@throw/', dir: '/out/graphQL/throw' },
	{ prefix: '@tests/', dir: '/elsewhere/dist/lib' }
]

const rewrite = (text: string, fileDir = '/out/koa'): string => rewriteAliasSpecifiers(text, fileDir, ALIASES)

describe('relativeSpecifier', () => {
	it('starts with ./ for a file in the same directory', () => {
		expect(relativeSpecifier('/out/lib', '/out/lib/x.mjs')).to.equal('./x.mjs')
	})

	it('starts with ./ for a file below the directory', () => {
		expect(relativeSpecifier('/out/lib', '/out/lib/sub/deep/x.mjs')).to.equal('./sub/deep/x.mjs')
	})

	it('goes up with ../ for a sibling directory and for a tree elsewhere', () => {
		expect(relativeSpecifier('/out/koa', '/out/lib/x.mjs')).to.equal('../lib/x.mjs')
		expect(relativeSpecifier('/out/koa/router', '/elsewhere/dist/lib/x.mjs')).to.equal('../../../elsewhere/dist/lib/x.mjs')
	})

	it('does not mistake a file named like a parent reference for one', () => {
		expect(relativeSpecifier('/out/lib', '/out/lib/..x.mjs')).to.equal('./..x.mjs')
	})
})

describe('rewriteAliasSpecifiers', () => {
	it('rewrites a single-quoted and a double-quoted specifier to a double-quoted relative one', () => {
		expect(rewrite(`import { a } from '@lib/a.mjs'\nimport b from "@throw/b.mjs"\n`)).to.equal(
			`import { a } from "../lib/a.mjs"\nimport b from "../graphQL/throw/b.mjs"\n`
		)
	})

	it('rewrites every form: export-from, side-effect, dynamic and import types', () => {
		const input = [
			`export * from '@lib/a.mjs';`,
			`import '@lib/b.mjs';`,
			`const c = await import('@lib/c.mjs');`,
			`export declare const d: typeof import("@lib/d.mjs").d;`
		].join('\n')
		expect(rewrite(input)).to.equal(
			[
				`export * from "../lib/a.mjs";`,
				`import "../lib/b.mjs";`,
				`const c = await import("../lib/c.mjs");`,
				`export declare const d: typeof import("../lib/d.mjs").d;`
			].join('\n')
		)
	})

	it('rewrites two specifiers on one line and keeps the text between them byte for byte', () => {
		expect(rewrite(`const m = [import('@lib/a.mjs'),  import('@lib/b.mjs')] // done\n`)).to.equal(
			`const m = [import("../lib/a.mjs"),  import("../lib/b.mjs")] // done\n`
		)
	})

	it('resolves each alias against its own directory, including one outside the emitted tree', () => {
		expect(rewrite(`import a from '@tests/a.mjs'`, '/out/koa')).to.equal(`import a from "../../elsewhere/dist/lib/a.mjs"`)
		expect(rewrite(`import a from '@lib/sub/a.mjs'`, '/out/lib')).to.equal(`import a from "./sub/a.mjs"`)
	})

	it('passes npm scoped packages and plain relative specifiers through', () => {
		const text = [
			`import * as Sentry from '@sentry/node'`,
			`import { hash } from '@node-rs/bcrypt'`,
			`import type { Request } from '@types/express'`,
			`import { Document } from '@gltf-transform/core'`,
			`import { x } from './x.mjs'`,
			`import { y } from "../y.mjs"`,
			`import fs from 'node:fs'`
		].join('\n')
		expect(rewrite(text)).to.equal(text)
	})

	it('matches the whole prefix, so a longer scope that starts with the same letters is left alone', () => {
		const text = `import a from '@library/a.mjs'\nimport b from '@lib'\n`
		expect(rewrite(text)).to.equal(text)
	})

	it('leaves the alias text alone outside a specifier position', () => {
		const text = [
			`// import a from '@lib/a.mjs'`,
			`/** @example import('@lib/b.mjs') */`,
			`const note = 'import c from "@lib/c.mjs"'`,
			'const t = `@lib/d.mjs`',
			`call('@lib/e.mjs')`
		].join('\n')
		expect(rewrite(text)).to.equal(text)
	})

	it('returns the very same text when there is nothing to rewrite', () => {
		expect(rewrite('')).to.equal('')
		expect(rewrite(`export const a = 1\n`)).to.equal(`export const a = 1\n`)
	})

	it('refuses a specifier it could not write back between double quotes', () => {
		expect(() => rewrite(`import a from '@lib/a"b.mjs'`)).to.throw('a quote or a backslash')
		expect(() => rewrite(`import a from '@lib/a\\u0062.mjs'`)).to.throw('a quote or a backslash')
	})
})
