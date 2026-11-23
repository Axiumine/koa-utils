// Works out, from a tsconfig, which aliases to rewrite and where the emitted files are.
//
// The alias map is read from `compilerOptions.paths` of the config the build compiles with, so there is no second list that can
// drift from it. `extends` is followed (tsconfig.build-tests.json extends tsconfig.json), a `null` option clears an inherited one
// as in tsc, and every path is made absolute against the config that wrote it. Anything the build does not use is refused
// instead of guessed: `baseUrl`, a package-name `extends`, a `paths` entry that is not `"<prefix>/*": ["<dir>/*"]`.
import path from 'node:path'

import { AliasError } from './errors.mts'
import { parseJsonc } from './jsonc.mts'
import type { Alias } from './rewrite.mts'

export type ReadText = (file: string) => string

export interface Plan {
	aliases: Alias[]
	// Directories holding emitted files: `outDir`, plus `declarationDir` when it is set and differs.
	outDirs: string[]
}

interface Options {
	rootDir?: string | null
	outDir?: string | null
	declarationDir?: string | null
	paths?: Record<string, string[]> | null
}

const PATH_OPTIONS = ['rootDir', 'outDir', 'declarationDir'] as const
// One `*`, at the end, after a slash: `@lib/*` and `./src/lib/*`.
const WILDCARD_DIR = /^[^*]+\/\*$/

function asObject(value: unknown, what: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new AliasError(`${what} must be a JSON object`)
	}
	return value as Record<string, unknown>
}

function loadJson(file: string, read: ReadText): Record<string, unknown> {
	try {
		return asObject(parseJsonc(read(file)), file)
	} catch (cause) {
		throw new AliasError(`${file} cannot be read as a tsconfig: ${(cause as Error).message}`)
	}
}

function resolveDir(value: unknown, dir: string, name: string): string | null {
	if (value === null) {
		return null
	}
	if (typeof value !== 'string') {
		throw new AliasError(`compilerOptions.${name} must be a string`)
	}
	return path.resolve(dir, value)
}

function resolvePaths(value: unknown, dir: string): Record<string, string[]> {
	const resolved: Record<string, string[]> = {}
	for (const [key, targets] of Object.entries(asObject(value, 'compilerOptions.paths'))) {
		if (!Array.isArray(targets) || !targets.every((target) => typeof target === 'string')) {
			throw new AliasError(`compilerOptions.paths[${JSON.stringify(key)}] must be an array of strings`)
		}
		resolved[key] = targets.map((target: string) => path.resolve(dir, target))
	}
	return resolved
}

function pickOptions(own: Record<string, unknown>, dir: string): Options {
	if (own['baseUrl'] !== undefined) {
		throw new AliasError('compilerOptions.baseUrl is not supported: paths would resolve against it, not against the config')
	}
	const picked: Options = {}
	for (const name of PATH_OPTIONS) {
		if (own[name] !== undefined) {
			picked[name] = resolveDir(own[name], dir, name)
		}
	}
	if (own['paths'] !== undefined) {
		picked.paths = own['paths'] === null ? null : resolvePaths(own['paths'], dir)
	}
	return picked
}

function parentFile(parent: unknown, file: string): string {
	if (typeof parent !== 'string' || !parent.startsWith('.')) {
		throw new AliasError(`${file}: "extends" must be one relative path, a package name or a list is not supported`)
	}
	const resolved = path.resolve(path.dirname(file), parent)
	return resolved.endsWith('.json') ? resolved : `${resolved}.json`
}

function readOptions(file: string, read: ReadText): Options {
	const json = loadJson(file, read)
	const own = pickOptions(asObject(json['compilerOptions'] ?? {}, `${file} compilerOptions`), path.dirname(file))
	return json['extends'] === undefined ? own : { ...readOptions(parentFile(json['extends'], file), read), ...own }
}

// The directory a source directory is emitted to: the same position under outDir as it has under rootDir.
function toAlias(key: string, targets: string[], rootDir: string, outDir: string): Alias {
	const target = targets[0]
	if (!WILDCARD_DIR.test(key) || targets.length !== 1 || !WILDCARD_DIR.test(target as string)) {
		throw new AliasError(
			`unsupported "paths" entry ${JSON.stringify(key)}: only "<prefix>/*" mapped to one "<dir>/*" is supported`
		)
	}
	const sourceDir = (target as string).slice(0, -2)
	return { prefix: key.slice(0, -1), dir: path.join(outDir, path.relative(rootDir, sourceDir)) }
}

export function planFor(configFile: string, read: ReadText): Plan {
	const { rootDir, outDir, declarationDir, paths } = readOptions(configFile, read)
	if (!rootDir || !outDir || !paths) {
		throw new AliasError(`${configFile} needs rootDir, outDir and paths in compilerOptions (own or inherited)`)
	}
	return {
		aliases: Object.entries(paths).map(([key, targets]) => toAlias(key, targets, rootDir, outDir)),
		outDirs: [...new Set([outDir, declarationDir ?? outDir])]
	}
}
