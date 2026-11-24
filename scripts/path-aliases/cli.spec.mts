import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import { main, type Deps } from './cli.mts'
import { planFor } from './config.mts'
import { scanSpecifiers } from './scan.mts'

const REPO = path.resolve(import.meta.dirname, '../..')
const ENTRY = path.join(REPO, 'scripts', 'rewrite-path-aliases.mts')

const TSCONFIG = `{
	// comments and a trailing comma, as in the real one
	"compilerOptions": {
		"rootDir": "./src",
		"outDir": "./out",
		"declarationDir": "./types",
		"paths": { "@lib/*": ["./src/lib/*"], "@tests/*": ["./src/tests/*"] },
	},
}`

let root = ''
let errors: string[] = []

const deps = (over: Partial<Deps> = {}): Deps => ({ fs, error: (message) => errors.push(message), ...over })
const write = (rel: string, text: string): void => {
	fs.mkdirSync(path.dirname(`${root}/${rel}`), { recursive: true })
	fs.writeFileSync(`${root}/${rel}`, text)
}
const read = (rel: string): string => fs.readFileSync(`${root}/${rel}`, 'utf8')
const run = (...args: string[]): number => main(args, root, deps())

describe('path aliases cli', () => {
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'path-aliases-'))
		errors = []
		write('tsconfig.json', TSCONFIG)
		write('out/koa/handler.mjs', `import { a } from '@lib/a.mjs'\nimport Sentry from '@sentry/node'\nexport const h = a\n`)
		write('out/koa/sub/deep.mjs', `import '@lib/a.mjs'\nconst t = await import('@tests/t.mjs')\n`)
		write('out/lib/a.mjs', `export const a = 1\n`)
		write('types/koa/handler.d.mts', `export declare const h: typeof import("@lib/a.mjs").a;\n`)
	})

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true })
	})

	it('rewrites the aliases in every .mjs under outDir and every .d.mts under declarationDir, relative to each file', () => {
		expect(run('tsconfig.json')).to.equal(0)
		expect(errors).to.deep.equal([])
		expect(read('out/koa/handler.mjs')).to.equal(
			`import { a } from "../lib/a.mjs"\nimport Sentry from '@sentry/node'\nexport const h = a\n`
		)
		expect(read('out/koa/sub/deep.mjs')).to.equal(`import "../../lib/a.mjs"\nconst t = await import("../../tests/t.mjs")\n`)
		expect(read('types/koa/handler.d.mts')).to.equal(`export declare const h: typeof import("../../out/lib/a.mjs").a;\n`)
	})

	it('leaves a file with nothing to rewrite, and every other file type, untouched', () => {
		const map = `{"mappings":"AAAA","sourcesContent":["import a from '@lib/a.mjs'"]}`
		write('out/koa/handler.mjs.map', map)
		const aged = new Date(Date.now() - 60_000)
		fs.utimesSync(`${root}/out/lib/a.mjs`, aged, aged)
		// utimes takes seconds as a double, so the stored time can differ from `aged` by a sub-millisecond rounding. Compare with what the file system holds, not with the Date.
		const before = fs.statSync(`${root}/out/lib/a.mjs`).mtimeMs
		expect(before).to.be.lessThan(Date.now() - 30_000)
		expect(run('tsconfig.json')).to.equal(0)
		expect(read('out/koa/handler.mjs.map')).to.equal(map)
		expect(fs.statSync(`${root}/out/lib/a.mjs`).mtimeMs).to.equal(before)
	})

	it('is idempotent: a second run changes nothing', () => {
		run('tsconfig.json')
		const once = [read('out/koa/handler.mjs'), read('out/koa/sub/deep.mjs'), read('types/koa/handler.d.mts')]
		expect(run('tsconfig.json')).to.equal(0)
		expect([read('out/koa/handler.mjs'), read('out/koa/sub/deep.mjs'), read('types/koa/handler.d.mts')]).to.deep.equal(once)
	})

	it('resolves the config against the root it is given, and accepts an absolute path', () => {
		expect(main([path.join(root, 'tsconfig.json')], os.tmpdir(), deps())).to.equal(0)
		expect(read('out/koa/handler.mjs')).to.contain('"../lib/a.mjs"')
	})

	it('exits 2 with the usage line when the arguments are not exactly one config', () => {
		expect(run()).to.equal(2)
		expect(run('tsconfig.json', 'extra')).to.equal(2)
		expect(errors).to.deep.equal([
			'usage: node scripts/rewrite-path-aliases.mts <tsconfig.json>',
			'usage: node scripts/rewrite-path-aliases.mts <tsconfig.json>'
		])
	})

	it('exits 2 when the config cannot be read or understood', () => {
		expect(run('missing.json')).to.equal(2)
		expect(errors[0]).to.contain('cannot be read as a tsconfig')
		write('bad.json', '{"compilerOptions": {"rootDir": "./src"}}')
		expect(run('bad.json')).to.equal(2)
		expect(errors[1]).to.contain('needs rootDir, outDir and paths')
	})

	it('exits 2 when the compile step has not run: outDir missing, or without a .mjs or .d.mts', () => {
		fs.rmSync(`${root}/out`, { recursive: true })
		expect(run('tsconfig.json')).to.equal(2)
		expect(errors[0]).to.contain('out cannot be listed')
		write('out/koa/handler.mjs.map', '{}')
		expect(run('tsconfig.json')).to.equal(2)
		expect(errors[1]).to.contain('holds no .mjs or .d.mts file')
	})

	it('lets a failure that is not an AliasError through instead of reporting it as bad usage', () => {
		write('out/koa/handler.mjs', `import a from '@lib/a"b.mjs'\n`)
		expect(() => run('tsconfig.json')).to.throw('a quote or a backslash')
		expect(errors).to.deep.equal([])
	})

	describe('entry file', () => {
		it('scripts/rewrite-path-aliases.mts runs under Node type stripping and exits 2 on bad usage', () => {
			const result = spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' })
			expect(result.status).to.equal(2)
			expect(result.stderr).to.contain('usage:')
		})

		it('reports a bad config on stderr, and rewrites a good one end to end', () => {
			const bad = spawnSync(process.execPath, [ENTRY, path.join(root, 'missing.json')], { encoding: 'utf8' })
			expect(bad.status).to.equal(2)
			expect(bad.stderr).to.contain('cannot be read as a tsconfig')
			const good = spawnSync(process.execPath, [ENTRY, path.join(root, 'tsconfig.json')], { encoding: 'utf8' })
			expect(good.status).to.equal(0)
			expect(good.stdout).to.equal('')
			expect(good.stderr).to.equal('')
			expect(read('out/koa/handler.mjs')).to.contain('"../lib/a.mjs"')
		})
	})
})

// The build wiring, not the tool: `yarn build` and `yarn build:tests` must have run the rewrite over everything they emit.
describe('the built output of this repo', () => {
	const emitted = (dir: string): string[] =>
		fs
			.readdirSync(path.join(REPO, dir), { recursive: true, encoding: 'utf8' })
			.filter((rel) => /\.(mjs|d\.mts)$/.test(rel))
			.map((rel) => path.join(REPO, dir, rel))

	const leftovers = (dir: string, config: string): { files: number; left: string[] } => {
		const { aliases } = planFor(path.join(REPO, config), (file) => fs.readFileSync(file, 'utf8'))
		const files = emitted(dir)
		const left = files.flatMap((file) =>
			scanSpecifiers(fs.readFileSync(file, 'utf8'))
				.filter(({ body }) => aliases.some(({ prefix }) => body.startsWith(prefix)))
				.map(({ body }) => `${file}: ${body}`)
		)
		return { files: files.length, left }
	}

	it('dist/ holds no path alias in a specifier', () => {
		const { files, left } = leftovers('dist', 'tsconfig.json')
		expect(files).to.be.greaterThan(100)
		expect(left).to.deep.equal([])
	})

	it('dist-test/ holds no path alias in a specifier', () => {
		const { files, left } = leftovers('dist-test', 'tsconfig.build-tests.json')
		expect(files).to.be.greaterThan(100)
		expect(left).to.deep.equal([])
	})
})
