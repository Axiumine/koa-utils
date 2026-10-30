// Command line driver: `main(args, rootDir, deps)` returns the exit code (0 ok, 1 violations, 2 bad usage or an
// environment that cannot be trusted: unparsable source, unreadable scope, unresolvable ref).
import nodeFs, { type Dirent } from 'node:fs'

import { compareToRef, DEFAULT_REF, gitReader, isSafeRef, RATCHET_FILES, flattenNumbers, type RefReader } from './against.mts'
import { CapsError } from './errors.mts'
import { measureSource, syntaxErrors, type Measurement } from './measure.mts'
import {
	type Baseline,
	compare,
	formatVerdict,
	isClean,
	label,
	lower,
	parseBaseline,
	serializeBaseline,
	toBaseline
} from './ratchet.mts'

export const BASELINE_FILE = '.code-caps-baseline.json'
const SCOPE_ROOTS = ['src', 'scripts']
const SKIPPED_DIRS = new Set(['node_modules', 'semgrep-canaries'])

export interface Deps {
	fs: Pick<typeof nodeFs, 'readFileSync' | 'writeFileSync' | 'readdirSync' | 'existsSync'>
	git: (rootDir: string) => RefReader
	log: (message: string) => void
	error: (message: string) => void
}

const realDeps: Deps = { fs: nodeFs, git: gitReader, log: console.log, error: console.error }

const USAGE = 'usage: node scripts/check-code-caps.mts [--update | --report | --accept | --against [ref]]'
const MODES = new Set(['--update', '--report', '--accept', '--against'])

const reason = (cause: unknown): string => (cause as Error).message

// Every `.mts` under src/ and scripts/, minus specs, semgrep fixtures and node_modules. Relative posix paths, sorted.
// Fails closed (CapsError): an unreadable or missing scope root, and any symlink. A symlink could point outside the
// repo or loop, and a dangling one cannot be measured, so the scope must hold real files and directories only.
export function listSources(rootDir: string, fs: Deps['fs']): string[] {
	const found: string[] = []
	const walk = (rel: string): void => {
		let entries: Dirent[]
		try {
			entries = fs.readdirSync(`${rootDir}/${rel}`, { withFileTypes: true })
		} catch (cause) {
			throw new CapsError(`${rel}/ cannot be read: ${reason(cause)}`)
		}
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
			const next = `${rel}/${entry.name}`
			if (entry.isSymbolicLink()) {
				throw new CapsError(`${next} is a symlink: the scanned scope may hold real files only, replace it with the file itself`)
			}
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) {
					walk(next)
				}
			} else if (entry.name.endsWith('.mts') && !entry.name.endsWith('.spec.mts')) {
				found.push(next)
			}
		}
	}
	SCOPE_ROOTS.forEach(walk)
	return found
}

function readSource(rootDir: string, rel: string, fs: Deps['fs']): string {
	try {
		return fs.readFileSync(`${rootDir}/${rel}`, 'utf8')
	} catch (cause) {
		throw new CapsError(`${rel} cannot be read: ${reason(cause)}`)
	}
}

// A file that does not parse is never measured: a half-parsed tree under-counts and the gate would pass on it.
function measureAll(rootDir: string, fs: Deps['fs']): Measurement[] {
	const sources = listSources(rootDir, fs).map((rel) => ({ rel, text: readSource(rootDir, rel, fs) }))
	const broken = sources.flatMap(({ rel, text }) => syntaxErrors(rel, text))
	if (broken.length > 0) {
		throw new CapsError(broken.join('\n'))
	}
	return sources.flatMap(({ rel, text }) => measureSource(rel, text))
}

function readBaseline(rootDir: string, fs: Deps['fs']): { baseline: Baseline } | { problem: string } {
	const restore = `Restore it: git checkout -- ${BASELINE_FILE}`
	let text: string
	try {
		text = fs.readFileSync(`${rootDir}/${BASELINE_FILE}`, 'utf8')
	} catch (cause) {
		return { problem: `${BASELINE_FILE} cannot be read: ${reason(cause)}. ${restore}` }
	}
	try {
		return { baseline: parseBaseline(text) }
	} catch (cause) {
		return { problem: `${BASELINE_FILE} is invalid: ${reason(cause)}. ${restore}` }
	}
}

function report(current: Measurement[], deps: Deps): number {
	current.forEach((m) => deps.log(label(m)))
	deps.log(`${current.length} cap violation(s)`)
	return 0
}

function accept(current: Measurement[], rootDir: string, deps: Deps): number {
	deps.fs.writeFileSync(`${rootDir}/${BASELINE_FILE}`, serializeBaseline(toBaseline(current)))
	deps.log(`baseline written: ${current.length} entr${current.length === 1 ? 'y' : 'ies'} (full snapshot: review the diff)`)
	return 0
}

function update(current: Measurement[], baseline: Baseline, rootDir: string, deps: Deps): number {
	const next = lower(current, baseline)
	deps.fs.writeFileSync(`${rootDir}/${BASELINE_FILE}`, serializeBaseline(next))
	deps.log(
		`baseline lowered: ${Object.keys(baseline).length} -> ${Object.keys(next).length} entries (never raised, never added)`
	)
	// --update only lowers, so NEW or GROWN violations are still there: say so and fail instead of reading as success.
	const verdict = compare(current, next)
	if (isClean(verdict)) {
		return 0
	}
	formatVerdict(verdict).forEach((line) => deps.error(line))
	deps.error('baseline lowered, but violations remain: --update never adds or raises, fix the code')
	return 1
}

function check(current: Measurement[], baseline: Baseline, deps: Deps): number {
	const verdict = compare(current, baseline)
	if (isClean(verdict)) {
		deps.log(`code caps ok: ${current.length} baselined violation(s), none new, none grown, none stale`)
		return 0
	}
	formatVerdict(verdict).forEach((line) => deps.error(line))
	return 1
}

// The ratchet files in the working tree may only get stricter than `ref`. Needs no measurement, only git.
function against(ref: string, rootDir: string, deps: Deps): number {
	const reader = deps.git(rootDir)
	if (!reader.resolves(ref)) {
		throw new CapsError(`cannot resolve ${ref}: the ratchet comparison cannot run. Fix it with: git fetch origin main`)
	}
	const problems = RATCHET_FILES.flatMap((file) => {
		if (!deps.fs.existsSync(`${rootDir}/${file}`)) {
			return []
		}
		const base = reader.show(ref, file)
		return compareToRef(
			file,
			flattenNumbers(readSource(rootDir, file, deps.fs), file),
			base === undefined ? undefined : flattenNumbers(base, `${ref}:${file}`),
			ref
		)
	})
	if (problems.length > 0) {
		problems.forEach((line) => deps.error(line))
		return 1
	}
	deps.log(`ratchets ok: ${RATCHET_FILES.join(', ')} are no looser than ${ref}`)
	return 0
}

const refOf = (rest: string[]): string => rest[0] ?? DEFAULT_REF

// Why the arguments cannot be run, or undefined when they can. `--against` alone takes one optional ref.
function usageProblem(mode: string | undefined, rest: string[]): string | undefined {
	const maxRest = mode === '--against' ? 1 : 0
	if (rest.length > maxRest || (mode !== undefined && !MODES.has(mode))) {
		return USAGE
	}
	if (mode === '--against' && !isSafeRef(refOf(rest))) {
		return `${USAGE}\nunsafe ref: ${refOf(rest)}`
	}
	return undefined
}

function run(args: string[], rootDir: string, deps: Deps): number {
	const [mode, ...rest] = args
	const problem = usageProblem(mode, rest)
	if (problem !== undefined) {
		deps.error(problem)
		return 2
	}
	if (mode === '--against') {
		return against(refOf(rest), rootDir, deps)
	}
	const current = measureAll(rootDir, deps.fs)
	if (mode === '--report') {
		return report(current, deps)
	}
	if (mode === '--accept') {
		return accept(current, rootDir, deps)
	}
	const read = readBaseline(rootDir, deps.fs)
	if ('problem' in read) {
		// Fail closed: a missing or unreadable baseline must never read as "no debt allowed to exist".
		deps.error(`${read.problem} Every violation below counts as new.`)
		current.forEach((m) => deps.error(`NEW   ${label(m)}`))
		return 1
	}
	return mode === '--update' ? update(current, read.baseline, rootDir, deps) : check(current, read.baseline, deps)
}

export function main(args: string[], rootDir: string, deps: Deps = realDeps): number {
	try {
		return run(args, rootDir, deps)
	} catch (cause) {
		if (cause instanceof CapsError) {
			deps.error(cause.message)
			return 2
		}
		throw cause
	}
}
