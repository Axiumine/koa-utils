// Command line driver: `main(args, rootDir, deps)` returns the exit code (0 done, 2 bad usage or output it cannot trust).
// Silent on success, like tsc: the build runs it from `prepare`, and `npm pack --json` must keep a clean stdout.
//
// `node scripts/rewrite-path-aliases.mts <tsconfig>` runs right after `tsc -p <tsconfig>`: it rewrites the path aliases into
// relative specifiers in every `.mjs` and `.d.mts` under that config's outDir (and declarationDir), in place. It replaces a
// compiler transformer plugin, which needed the compiler patched; this needs only Node and the tsconfig.
import nodeFs from 'node:fs'
import path from 'node:path'

import { planFor } from './config.mts'
import { AliasError } from './errors.mts'
import { rewriteAliasSpecifiers, type Alias } from './rewrite.mts'

export interface Deps {
	fs: Pick<typeof nodeFs, 'readFileSync' | 'writeFileSync' | 'readdirSync'>
	error: (message: string) => void
}

const realDeps: Deps = { fs: nodeFs, error: console.error }

const USAGE = 'usage: node scripts/rewrite-path-aliases.mts <tsconfig.json>'
// Emitted JavaScript and declarations. `.mjs.map` and the like are not text this tool edits.
const EMITTED = /\.(mjs|d\.mts)$/

// Fails closed: an outDir that is missing or holds no emitted file means the compile step did not run, and "nothing to
// rewrite" must not read as done.
function listEmitted(outDir: string, fs: Deps['fs']): string[] {
	let found: string[]
	try {
		found = fs.readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter((rel) => EMITTED.test(rel))
	} catch (cause) {
		throw new AliasError(`${outDir} cannot be listed: ${(cause as Error).message}. Run the compile step first.`)
	}
	if (found.length === 0) {
		throw new AliasError(`${outDir} holds no .mjs or .d.mts file. Run the compile step first.`)
	}
	return found.sort().map((rel) => path.join(outDir, rel))
}

// A file with no alias is left untouched, not rewritten with the same bytes: its mtime stays, so incremental tools see no change.
function rewriteFile(file: string, aliases: readonly Alias[], fs: Deps['fs']): void {
	const text = fs.readFileSync(file, 'utf8')
	const next = rewriteAliasSpecifiers(text, path.dirname(file), aliases)
	if (next !== text) {
		fs.writeFileSync(file, next)
	}
}

function run(configArg: string, rootDir: string, deps: Deps): number {
	const { aliases, outDirs } = planFor(path.resolve(rootDir, configArg), (file) => deps.fs.readFileSync(file, 'utf8'))
	const files = outDirs.flatMap((outDir) => listEmitted(outDir, deps.fs))
	files.forEach((file) => rewriteFile(file, aliases, deps.fs))
	return 0
}

export function main(args: string[], rootDir: string, deps: Deps = realDeps): number {
	const [configArg, ...rest] = args
	if (configArg === undefined || rest.length > 0) {
		deps.error(USAGE)
		return 2
	}
	try {
		return run(configArg, rootDir, deps)
	} catch (cause) {
		if (cause instanceof AliasError) {
			deps.error(cause.message)
			return 2
		}
		throw cause
	}
}
