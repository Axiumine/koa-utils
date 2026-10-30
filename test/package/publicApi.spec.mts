import { strict as assert } from 'node:assert'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { assertSnapshot } from '../helpers/snapshot.mjs'

type ExportTarget = { import: string; types: string }

const ROOT = process.cwd()
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { exports: Record<string, ExportTarget> }
const exportKeys = Object.keys(pkg.exports).sort()

// dist .mjs real but not in exports map → owner decides whether they become public
// validateMimeTypePdf: unexported today. checkForNSFW: fully commented-out, excluded in .c8rc.json
const UNEXPORTED_ALLOWLIST = ['dist/files/validateMimeTypePdf.mjs', 'dist/files/checkForNSFW.mjs']

// type-only emit + internal tree → never public
const isNonPublicPath = (rel: string): boolean => {
	const parts = rel.split('/')
	const base = parts[parts.length - 1] ?? ''
	return parts.includes('private') || parts.includes('types') || parts.includes('interfaces') || /^I[A-Z]/.test(base)
}

const listMjs = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) return listMjs(full)
		return entry.name.endsWith('.mjs') ? [relative(ROOT, full).split(sep).join('/')] : []
	})

describe('package/publicApi', () => {
	it('every exports key has import and types targets that exist in dist', () => {
		for (const key of exportKeys) {
			const target = pkg.exports[key] as ExportTarget
			assert.deepEqual(Object.keys(target).sort(), ['import', 'types'], `${key}: conditions`)
			for (const file of [target.import, target.types]) {
				assert.ok(existsSync(resolve(ROOT, file)), `${key}: missing ${file}`)
			}
		}
	})

	it('exports map and runtime symbol names match the committed snapshot', async () => {
		const surface: Record<string, string[]> = {}
		for (const key of exportKeys) {
			const target = pkg.exports[key] as ExportTarget
			const mod = (await import(pathToFileURL(resolve(ROOT, target.import)).href)) as Record<string, unknown>
			surface[key] = Object.keys(mod).sort()
		}
		assertSnapshot('public-api.json', surface)
	})

	it('every public dist .mjs is reachable from exports unless allowlisted', () => {
		const exported = new Set(exportKeys.map((key) => (pkg.exports[key] as ExportTarget).import.replace(/^\.\//, '')))
		const unreachable = listMjs(resolve(ROOT, 'dist'))
			.filter((rel) => !isNonPublicPath(rel))
			.filter((rel) => !exported.has(rel) && !UNEXPORTED_ALLOWLIST.includes(rel))
		assert.deepEqual(unreachable, [], 'dist file not in package.json exports (add key, or allowlist with owner OK)')
	})

	it('allowlist holds no stale entry: each file exists and is still unexported', () => {
		const exported = new Set(exportKeys.map((key) => (pkg.exports[key] as ExportTarget).import.replace(/^\.\//, '')))
		for (const rel of UNEXPORTED_ALLOWLIST) {
			assert.ok(existsSync(resolve(ROOT, rel)), `allowlist entry gone from dist: ${rel}`)
			assert.ok(!exported.has(rel), `allowlist entry now exported, drop it: ${rel}`)
		}
	})
})
