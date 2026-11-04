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
// koa/createKoaErrorHandler + its 2 type files: 0 peers at runtime AND in .d.mts (no koa, graphql, sentry, dotenv)
// email/createSocketLabsSender: only @socketlabs/email at runtime, 0 in .d.mts (local structural types). Its 4 type files: 0 peers
// No sentry, no dotenv, no graphql: those stay in SocketLabsLib
// lib/PostgreSQL/{error,parse,pool,url,counter,tx,guard,role}/*: 0 peers at runtime AND in .d.mts. Driver = param w/ structural type (IDbDriver),
// never import of 'pg'. Only node:net (isValidHost) + node:crypto (tx/jitteredDelay) = builtin. Later kit subpaths (clock, lock) append here too
// lib/PostgreSQL/tx/* + error/{DbTxError,DB_TX_REASONS,IDbTxReason,IDbErrorFactory}: same, 0 peers runtime AND .d.mts. withTx take pool as param (ITxPool)
// lib/PostgreSQL/guard/* + error/{mapDbError,lookupConstraint,buildConstraintEntry,DB_INTERNAL_REASONS + types}: same, 0 peers runtime AND .d.mts.
// Error family = param (IDbErrorFactory), table = param (IConstraintTable), tx = param (ITx). No import of pg / application error class
// lib/PostgreSQL/role/* + error/{RoleAssertionError,ROLE_ASSERT_REASONS,IRoleAssertionReason,IRoleAssertionSubject}: same, 0 peers runtime AND .d.mts.
// assertRole take pool as param (IRolePool, structural over ITxClient). Catalog queries go through that pool, never through pg
const PEER_BUDGET: Record<string, string[]> = {
	'./lib/Constants': [],
	'./lib/emailHash': [],
	'./lib/tokens': [],
	'./koa/createKoaErrorHandler': [],
	'./koa/IKoaErrorHandlerContext': [],
	'./koa/IKoaErrorHandlerOptions': [],
	'./email/createSocketLabsSender': ['@socketlabs/email'],
	'./email/ISocketLabsClient': [],
	'./email/ISocketLabsMessage': [],
	'./email/ISocketLabsSendResult': [],
	'./email/ISocketLabsSenderOptions': [],
	'./lib/PostgreSQL/error/DB_CONNECT_REASONS': [],
	'./lib/PostgreSQL/error/DB_PARSE_REASONS': [],
	'./lib/PostgreSQL/error/DbConnectError': [],
	'./lib/PostgreSQL/error/DbParseError': [],
	'./lib/PostgreSQL/error/IDbConnectReason': [],
	'./lib/PostgreSQL/error/IDbParseReason': [],
	'./lib/PostgreSQL/error/constraintNameOf': [],
	'./lib/PostgreSQL/error/errorNameOf': [],
	'./lib/PostgreSQL/error/sqlstateField': [],
	'./lib/PostgreSQL/error/sqlstateOf': [],
	'./lib/PostgreSQL/error/DB_TX_REASONS': [],
	'./lib/PostgreSQL/error/DbTxError': [],
	'./lib/PostgreSQL/error/IDbErrorFactory': [],
	'./lib/PostgreSQL/error/IDbTxReason': [],
	'./lib/PostgreSQL/error/DB_INTERNAL_REASONS': [],
	'./lib/PostgreSQL/error/IConstraintEntry': [],
	'./lib/PostgreSQL/error/IConstraintEntryBuilder': [],
	'./lib/PostgreSQL/error/IConstraintTable': [],
	'./lib/PostgreSQL/error/IDbErrorCounter': [],
	'./lib/PostgreSQL/error/IDbErrorCounterName': [],
	'./lib/PostgreSQL/error/IDbInternalReason': [],
	'./lib/PostgreSQL/error/IMapDbErrorOptions': [],
	'./lib/PostgreSQL/error/buildConstraintEntry': [],
	'./lib/PostgreSQL/error/lookupConstraint': [],
	'./lib/PostgreSQL/error/mapDbError': [],
	'./lib/PostgreSQL/parse/IArrayParser': [],
	'./lib/PostgreSQL/parse/IDriverTypes': [],
	'./lib/PostgreSQL/parse/IStringParser': [],
	'./lib/PostgreSQL/parse/ITypeParserEntry': [],
	'./lib/PostgreSQL/parse/TYPE_PARSERS': [],
	'./lib/PostgreSQL/parse/arrayOf': [],
	'./lib/PostgreSQL/parse/createTypeRegistry': [],
	'./lib/PostgreSQL/parse/parseDate': [],
	'./lib/PostgreSQL/parse/parseInt8': [],
	'./lib/PostgreSQL/parse/parseTime': [],
	'./lib/PostgreSQL/parse/parseTimestamptz': [],
	'./lib/PostgreSQL/parse/parseUuid': [],
	'./lib/PostgreSQL/pool/DEFAULT_CONNECT_TIMEOUT_MS': [],
	'./lib/PostgreSQL/pool/DEFAULT_KEEPALIVE_INITIAL_DELAY_MS': [],
	'./lib/PostgreSQL/pool/ICreatePoolOptions': [],
	'./lib/PostgreSQL/pool/IDbDriver': [],
	'./lib/PostgreSQL/pool/IPoolCounter': [],
	'./lib/PostgreSQL/pool/IPoolCounterName': [],
	'./lib/PostgreSQL/pool/IPoolEvents': [],
	'./lib/PostgreSQL/pool/IPoolLogger': [],
	'./lib/PostgreSQL/pool/REQUIRED_SESSION_TIME_ZONE': [],
	'./lib/PostgreSQL/pool/createPool': [],
	'./lib/PostgreSQL/url/IDatabaseUrlOptions': [],
	'./lib/PostgreSQL/url/IDatabaseUrlReason': [],
	'./lib/PostgreSQL/url/LOOPBACK_HOSTS': [],
	'./lib/PostgreSQL/url/databaseUrlReason': [],
	'./lib/PostgreSQL/url/isAbsolutePath': [],
	'./lib/PostgreSQL/url/isValidHost': [],
	'./lib/PostgreSQL/tx/DEFAULT_LOCK_TIMEOUT_MS': [],
	'./lib/PostgreSQL/tx/IRetryDelay': [],
	'./lib/PostgreSQL/tx/ITx': [],
	'./lib/PostgreSQL/tx/ITxClient': [],
	'./lib/PostgreSQL/tx/ITxCounter': [],
	'./lib/PostgreSQL/tx/ITxCounterName': [],
	'./lib/PostgreSQL/tx/ITxFailureReason': [],
	'./lib/PostgreSQL/tx/ITxIsolation': [],
	'./lib/PostgreSQL/tx/ITxOptions': [],
	'./lib/PostgreSQL/tx/ITxPool': [],
	'./lib/PostgreSQL/tx/ITxResult': [],
	'./lib/PostgreSQL/tx/MAX_LOCK_TIMEOUT_MS': [],
	'./lib/PostgreSQL/tx/TX_FAILURE_REASONS': [],
	'./lib/PostgreSQL/tx/TX_ISOLATION_LEVELS': [],
	'./lib/PostgreSQL/tx/TX_RETRY_BASE_DELAY_MS': [],
	'./lib/PostgreSQL/tx/TX_RETRY_MAX': [],
	'./lib/PostgreSQL/tx/TX_RETRY_MAX_CEILING': [],
	'./lib/PostgreSQL/tx/defaultRetryDelay': [],
	'./lib/PostgreSQL/tx/jitteredDelay': [],
	'./lib/PostgreSQL/tx/withTx': [],
	'./lib/PostgreSQL/guard/IAffectedResult': [],
	'./lib/PostgreSQL/guard/IGuardCounter': [],
	'./lib/PostgreSQL/guard/IVersionGuardCode': [],
	'./lib/PostgreSQL/guard/IVersionGuardField': [],
	'./lib/PostgreSQL/guard/IVersionGuardInput': [],
	'./lib/PostgreSQL/guard/VERSION_GUARD_FIELDS': [],
	'./lib/PostgreSQL/guard/assertAffected': [],
	'./lib/PostgreSQL/guard/guardVersion': [],
	'./lib/PostgreSQL/error/IRoleAssertionReason': [],
	'./lib/PostgreSQL/error/IRoleAssertionSubject': [],
	'./lib/PostgreSQL/error/ROLE_ASSERT_REASONS': [],
	'./lib/PostgreSQL/error/RoleAssertionError': [],
	'./lib/PostgreSQL/role/IAssertRoleOptions': [],
	'./lib/PostgreSQL/role/IRoleAssertion': [],
	'./lib/PostgreSQL/role/IRoleGrant': [],
	'./lib/PostgreSQL/role/IRolePool': [],
	'./lib/PostgreSQL/role/assertRole': [],
	'./lib/PostgreSQL/counter/IDbCounter': [],
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
