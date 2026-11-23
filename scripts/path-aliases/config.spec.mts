import fs from 'node:fs'
import path from 'node:path'

import { expect } from 'chai'

import { planFor, type ReadText } from './config.mts'
import { AliasError } from './errors.mts'

const ROOT = path.resolve(import.meta.dirname, '../..')

// An in-memory file system: a path that is not listed fails to read, as a missing file does.
const files =
	(tree: Record<string, string>): ReadText =>
	(file) => {
		const text = tree[file]
		if (text === undefined) {
			throw new Error(`ENOENT: ${file}`)
		}
		return text
	}

const config = (compilerOptions: unknown, extra: Record<string, unknown> = {}): string =>
	JSON.stringify({ compilerOptions, ...extra })

const BASE = {
	rootDir: './src',
	outDir: './dist/esm',
	paths: { '@lib/*': ['./src/lib/*'], '@throw/*': ['./src/graphQL/throw/*'] }
}

const ENTRY = '/p/tsconfig.json'
const planOf = (tree: Record<string, string>) => planFor(ENTRY, files(tree))
const optionsPlan = (compilerOptions: unknown) => planOf({ [ENTRY]: config(compilerOptions) })

// The message of the AliasError a config produces.
function failure(tree: Record<string, string>): string {
	let caught: unknown
	try {
		planOf(tree)
	} catch (cause) {
		caught = cause
	}
	expect(caught).to.be.instanceOf(AliasError)
	return (caught as Error).message
}
const optionsFailure = (compilerOptions: unknown): string => failure({ [ENTRY]: config(compilerOptions) })

describe('planFor: one config', () => {
	it('maps each alias to where its source directory is emitted, and lists outDir', () => {
		expect(optionsPlan(BASE)).to.deep.equal({
			aliases: [
				{ prefix: '@lib/', dir: '/p/dist/esm/lib' },
				{ prefix: '@throw/', dir: '/p/dist/esm/graphQL/throw' }
			],
			outDirs: ['/p/dist/esm']
		})
	})

	it('reads a config with comments and a trailing comma', () => {
		const text = `{\n\t// build\n\t"compilerOptions": {\n\t\t"rootDir": "./src", "outDir": "./out", /* x */\n\t\t"paths": {"@a/*": ["./src/a/*"],},\n\t},\n}`
		expect(planOf({ [ENTRY]: text })).to.deep.equal({ aliases: [{ prefix: '@a/', dir: '/p/out/a' }], outDirs: ['/p/out'] })
	})

	it('lists declarationDir as well when it differs from outDir, once when it does not', () => {
		expect(optionsPlan({ ...BASE, declarationDir: './types' }).outDirs).to.deep.equal(['/p/dist/esm', '/p/types'])
		expect(optionsPlan({ ...BASE, declarationDir: './dist/esm' }).outDirs).to.deep.equal(['/p/dist/esm'])
	})

	it('puts an alias whose source lies outside rootDir at the same distance from outDir', () => {
		const plan = optionsPlan({ rootDir: './test', outDir: './dist-test', paths: { '@lib/*': ['./dist/lib/*'] } })
		expect(plan.aliases).to.deep.equal([{ prefix: '@lib/', dir: '/p/dist/lib' }])
	})
})

describe('planFor: extends', () => {
	it('inherits what the child leaves out, and lets the child replace paths and clear an option with null', () => {
		const parent = config({ ...BASE, declarationDir: './dist/esm' })
		const child = config(
			{ rootDir: './test', outDir: './dist-test', declarationDir: null, paths: { '@lib/*': ['./dist/lib/*'] } },
			{ extends: './base' }
		)
		expect(planOf({ [ENTRY]: child, '/p/base.json': parent })).to.deep.equal({
			aliases: [{ prefix: '@lib/', dir: '/p/dist/lib' }],
			outDirs: ['/p/dist-test']
		})
	})

	it('resolves every path against the config that wrote it', () => {
		const parent = config({ rootDir: './src', paths: { '@a/*': ['./src/a/*'] } })
		const child = config({ outDir: './out' }, { extends: '../shared/base.json' })
		const plan = planFor('/p/app/tsconfig.json', files({ '/p/app/tsconfig.json': child, '/p/shared/base.json': parent }))
		expect(plan).to.deep.equal({ aliases: [{ prefix: '@a/', dir: '/p/app/out/a' }], outDirs: ['/p/app/out'] })
	})

	it('follows a chain of more than one level', () => {
		const tree = {
			[ENTRY]: config({}, { extends: './mid.json' }),
			'/p/mid.json': config({ outDir: './out' }, { extends: './top.json' }),
			'/p/top.json': config({ rootDir: './src', paths: { '@a/*': ['./src/a/*'] } })
		}
		expect(planOf(tree).aliases).to.deep.equal([{ prefix: '@a/', dir: '/p/out/a' }])
	})

	it('lets a child with a null paths drop the inherited aliases, which then fails as missing', () => {
		const tree = { [ENTRY]: config({ paths: null }, { extends: './base.json' }), '/p/base.json': config(BASE) }
		expect(failure(tree)).to.contain('needs rootDir, outDir and paths')
	})

	it('refuses an extends it cannot follow', () => {
		for (const extend of [['./a.json'], 7, '@tsconfig/node20/tsconfig.json']) {
			expect(failure({ [ENTRY]: config(BASE, { extends: extend }) }), JSON.stringify(extend)).to.contain(
				'"extends" must be one relative path'
			)
		}
	})

	it('reports a parent that does not exist', () => {
		expect(failure({ [ENTRY]: config(BASE, { extends: './missing.json' }) })).to.contain('ENOENT: /p/missing.json')
	})
})

describe('planFor: refuses what it cannot rewrite safely', () => {
	it('a config that cannot be read, is not JSON, or is not an object', () => {
		expect(failure({})).to.contain('cannot be read as a tsconfig: ENOENT: /p/tsconfig.json')
		expect(failure({ [ENTRY]: '{"compilerOptions": ' })).to.contain('cannot be read as a tsconfig')
		expect(failure({ [ENTRY]: '[]' })).to.contain('/p/tsconfig.json must be a JSON object')
		expect(failure({ [ENTRY]: '{"compilerOptions": []}' })).to.contain('compilerOptions must be a JSON object')
	})

	it('a config without compilerOptions, rootDir, outDir or paths', () => {
		for (const options of [{}, { ...BASE, rootDir: undefined }, { ...BASE, outDir: undefined }, { ...BASE, paths: undefined }]) {
			expect(optionsFailure(options)).to.contain('needs rootDir, outDir and paths')
		}
		expect(failure({ [ENTRY]: '{}' })).to.contain('needs rootDir, outDir and paths')
	})

	it('baseUrl, which would change what paths are relative to', () => {
		expect(optionsFailure({ ...BASE, baseUrl: '.' })).to.contain('baseUrl is not supported')
	})

	it('a directory option that is not a string', () => {
		expect(optionsFailure({ ...BASE, rootDir: 5 })).to.contain('compilerOptions.rootDir must be a string')
	})

	it('paths that are not an object, or an entry that is not a list of strings', () => {
		expect(optionsFailure({ ...BASE, paths: [] })).to.contain('compilerOptions.paths must be a JSON object')
		expect(optionsFailure({ ...BASE, paths: { '@a/*': './src/a/*' } })).to.contain('paths["@a/*"] must be an array of strings')
		expect(optionsFailure({ ...BASE, paths: { '@a/*': [1] } })).to.contain('must be an array of strings')
	})

	it('a paths entry that is not "<prefix>/*" mapped to one "<dir>/*"', () => {
		const unsupported = [
			{ '@a': ['./src/a/*'] },
			{ '@a/*/b/*': ['./src/a/*'] },
			{ '@a/*': ['./src/a/*', './src/b/*'] },
			{ '@a/*': [] },
			{ '@a/*': ['./src/a'] },
			{ '@a/*': ['./src/*/a/*'] }
		]
		for (const paths of unsupported) {
			expect(optionsFailure({ ...BASE, paths }), JSON.stringify(paths)).to.contain('unsupported "paths" entry')
		}
	})
})

describe('planFor: the real configs', () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { _moduleAliases: Record<string, string> }
	const real = (name: string) => planFor(path.join(ROOT, name), (file) => fs.readFileSync(file, 'utf8'))
	const moduleAliases = Object.entries(pkg._moduleAliases)

	it('tsconfig.json: the same aliases as package.json _moduleAliases, emitted under dist/esm, which the build then flattens to dist/', () => {
		const { aliases, outDirs } = real('tsconfig.json')
		expect(outDirs).to.deep.equal([path.join(ROOT, 'dist/esm')])
		expect(aliases.map((alias) => alias.prefix).sort()).to.deep.equal(moduleAliases.map(([name]) => `${name}/`).sort())
		for (const [name, dir] of moduleAliases) {
			const alias = aliases.find((candidate) => candidate.prefix === `${name}/`)
			expect(alias?.dir, name).to.equal(path.join(ROOT, 'dist/esm', path.relative('dist', dir)))
		}
	})

	it('tsconfig.build-tests.json: the same aliases, pointing at the built dist/', () => {
		const { aliases, outDirs } = real('tsconfig.build-tests.json')
		expect(outDirs).to.deep.equal([path.join(ROOT, 'dist-test')])
		expect(aliases.map((alias) => alias.prefix).sort()).to.deep.equal(moduleAliases.map(([name]) => `${name}/`).sort())
		for (const [name, dir] of moduleAliases) {
			const alias = aliases.find((candidate) => candidate.prefix === `${name}/`)
			expect(alias?.dir, name).to.equal(path.join(ROOT, dir))
		}
	})
})
