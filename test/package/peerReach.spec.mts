import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, resolve } from 'node:path'

import { assertSnapshot } from '../helpers/snapshot.mjs'

interface IPkg {
	exports: Record<string, { import: string; types: string }>
	peerDependencies: Record<string, string>
	peerDependenciesMeta: Record<string, { optional?: boolean }>
}
interface IReach {
	bare: Set<string>
	lazy: Set<string>
}
type TPeerReach = Record<string, { runtime: string[]; lazy: string[]; typesOnly: string[] }>

const ROOT = process.cwd()
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as IPkg
const peers = Object.keys(pkg.peerDependencies).sort()
const keys = Object.keys(pkg.exports).sort()

// peer → regex of subpaths allowed to load it AT IMPORT. Snapshot regen cannot widen reach past this.
// Peer absent here = unscoped (purpose too broad for 1 regex). /^$/ = no subpath: only lazy, via private facade
const PEER_SCOPE: Record<string, RegExp> = {
	'@sentry/node': /^$/,
	dotenv: /^$/,
	// models, data source, flows, mutations, Koa user readers, db helpers, ObjectId sentinel
	mongoose:
		/^\.\/(dataSources\/MongoDB|graphQL\/(models|schema\/mutations)\/|koa\/(middleware|router)\/|lib\/(OBJECTID_0_OBJ|access\/|db\/))/
}

// subpath → the only peers it may reach (runtime, lazy or types). [] = none. Snapshot regen cannot add one.
// Constants + emailHash + tokens were freed from mongoose / uuid in 8.0.0 → pinned. New peerless subpath → append with []
const PEER_BUDGET: Record<string, string[]> = {
	'./lib/Constants': [],
	'./lib/emailHash': [],
	'./lib/tokens': [],
	'./lib/checkEmailLen': ['graphql'],
	'./lib/checkPwdLen': ['graphql']
}

// 1st alt: import|export … from 'x' (multi-line ok). 2nd alt: side-effect import 'x'.
// Same specifier set as ts.preProcessFile on every dist file (cross-checked by hand, 0 diff)
const FROM = /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm
const CALL = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const specsOf = (re: RegExp, text: string): string[] => [...text.matchAll(re)].map((m) => m[1] ?? m[2] ?? '')

// bare pkg name of specifier. relative + node builtin → undefined
const pkgOf = (spec: string): string | undefined => {
	if (/^[./]/.test(spec) || spec.startsWith('node:') || builtinModules.includes(spec)) return undefined
	return spec
		.split('/')
		.slice(0, spec.startsWith('@') ? 2 : 1)
		.join('/')
}

const isName = (name: string | undefined): name is string => name !== undefined

// 1 dist file → bare pkgs, lazy pkgs, relative files to follow. types=true → .d.mts graph, import('x') type refs count
// as static. types=false → import('x') in .mjs = lazy (loaded on call, not at import)
const scan = (file: string, types: boolean): { bare: string[]; lazy: string[]; rel: string[] } => {
	assert.ok(existsSync(file), `dist file missing: ${file}`)
	const text = readFileSync(file, 'utf8')
	const calls = specsOf(CALL, text)
	const specs = [...specsOf(FROM, text), ...(types ? calls : [])]
	return {
		bare: specs.map(pkgOf).filter(isName),
		lazy: (types ? [] : calls).map(pkgOf).filter(isName),
		rel: specs.filter((s) => s.startsWith('.')).map((s) => resolve(dirname(file), types ? s.replace(/\.mjs$/, '.d.mts') : s))
	}
}

// BFS over relative imports from 1 dist entry
const walk = (entry: string, types: boolean): IReach => {
	const reach: IReach = { bare: new Set(), lazy: new Set() }
	const seen = new Set<string>()
	const todo = [resolve(ROOT, entry)]
	for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
		if (seen.has(file)) continue
		seen.add(file)
		const found = scan(file, types)
		found.bare.forEach((name) => reach.bare.add(name))
		found.lazy.forEach((name) => reach.lazy.add(name))
		todo.push(...found.rel)
	}
	return reach
}

// per peer: subpaths loading it at import (runtime), via import() on call (lazy), only in .d.mts (typesOnly)
const collect = (): { byPeer: TPeerReach; undeclared: string[] } => {
	const byPeer: TPeerReach = Object.fromEntries(peers.map((p) => [p, { runtime: [], lazy: [], typesOnly: [] }]))
	const undeclared = new Set<string>()
	for (const key of keys) {
		const target = pkg.exports[key] as { import: string; types: string }
		const run = walk(target.import, false)
		const typ = walk(target.types, true)
		for (const name of [...run.bare, ...typ.bare]) if (!peers.includes(name)) undeclared.add(`${key} → ${name}`)
		for (const peer of peers) {
			const row = byPeer[peer] as TPeerReach[string]
			if (run.bare.has(peer)) row.runtime.push(key)
			else if (typ.bare.has(peer)) row.typesOnly.push(key)
			if (run.lazy.has(peer)) row.lazy.push(key)
		}
	}
	return { byPeer, undeclared: [...undeclared] }
}

describe('package/peerReach', () => {
	const { byPeer, undeclared } = collect()

	it('exports has no root "." key and no wildcard key', () => {
		assert.deepEqual(
			keys.filter((k) => k === '.' || k.includes('*')),
			[],
			'root or wildcard key → 1 import drags whole graph, optional peers become hard'
		)
	})

	// 8.0.0: 0 hard peers. Hard peer → npm 7+ / Yarn install it for every consumer → owner call, walk first (peer-reach.json)
	it('every peer is optional in peerDependenciesMeta', () => {
		assert.deepEqual(
			peers.filter((peer) => pkg.peerDependenciesMeta[peer]?.optional !== true),
			[],
			'peer missing from peerDependenciesMeta, or not optional'
		)
	})

	it('peerDependenciesMeta names no pkg that is not a peer', () => {
		assert.deepEqual(
			Object.keys(pkg.peerDependenciesMeta).filter((name) => !peers.includes(name)),
			[],
			'stale peerDependenciesMeta entry'
		)
	})

	it('every bare import in dist is a declared peer', () => {
		assert.deepEqual(undeclared, [], 'import of pkg missing from peerDependencies')
	})

	it('scoped peers are loaded at import only inside their scope', () => {
		for (const [peer, scope] of Object.entries(PEER_SCOPE)) {
			assert.ok(peers.includes(peer), `scope names a pkg that is no peer: ${peer}`)
			const outside = (byPeer[peer]?.runtime ?? []).filter((key) => !scope.test(key))
			assert.deepEqual(outside, [], `${peer} loaded at import outside ${String(scope)}`)
		}
	})

	it('budgeted subpaths reach no peer beyond their budget', () => {
		for (const [key, allowed] of Object.entries(PEER_BUDGET)) {
			assert.ok(keys.includes(key), `budget names a subpath that is not exported: ${key}`)
			const reached = peers.filter((peer) => Object.values(byPeer[peer] ?? {}).some((list: string[]) => list.includes(key)))
			assert.deepEqual(
				reached.filter((peer) => !allowed.includes(peer)),
				[],
				`${key} reaches a peer outside its budget [${allowed.join(', ')}]`
			)
		}
	})

	it('peer reach per subpath matches the committed snapshot', () => {
		assertSnapshot('peer-reach.json', byPeer)
	})
})
