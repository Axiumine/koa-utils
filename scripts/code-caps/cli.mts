// Command line driver: `main(args, rootDir, deps)` returns the exit code (0 ok, 1 violations, 2 bad usage).
import nodeFs, { type Dirent } from 'node:fs'

import { measureSource, type Measurement } from './measure.mts'
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
	fs: Pick<typeof nodeFs, 'readFileSync' | 'writeFileSync' | 'readdirSync'>
	log: (message: string) => void
	error: (message: string) => void
}

const realDeps: Deps = { fs: nodeFs, log: console.log, error: console.error }

const USAGE = 'usage: node scripts/check-code-caps.mts [--update | --report | --accept]'
const MODES = new Set(['--update', '--report', '--accept'])

// Every `.mts` under src/ and scripts/, minus specs, semgrep fixtures and node_modules. Relative posix paths, sorted.
export function listSources(rootDir: string, fs: Deps['fs']): string[] {
	const found: string[] = []
	const walk = (rel: string): void => {
		let entries: Dirent[]
		try {
			entries = fs.readdirSync(`${rootDir}/${rel}`, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
			const next = `${rel}/${entry.name}`
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

function measureAll(rootDir: string, fs: Deps['fs']): Measurement[] {
	return listSources(rootDir, fs).flatMap((rel) => measureSource(rel, fs.readFileSync(`${rootDir}/${rel}`, 'utf8')))
}

function readBaseline(rootDir: string, fs: Deps['fs']): Baseline | undefined {
	try {
		return parseBaseline(fs.readFileSync(`${rootDir}/${BASELINE_FILE}`, 'utf8'))
	} catch {
		return undefined
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
	return 0
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

export function main(args: string[], rootDir: string, deps: Deps = realDeps): number {
	const [mode, ...rest] = args
	if (rest.length > 0 || (mode !== undefined && !MODES.has(mode))) {
		deps.error(USAGE)
		return 2
	}
	const current = measureAll(rootDir, deps.fs)
	if (mode === '--report') {
		return report(current, deps)
	}
	if (mode === '--accept') {
		return accept(current, rootDir, deps)
	}
	const baseline = readBaseline(rootDir, deps.fs)
	if (baseline === undefined) {
		// Fail closed: a missing or unreadable baseline must never read as "no debt allowed to exist".
		deps.error(
			`${BASELINE_FILE} is missing or invalid: every violation below counts as new. Restore it, or run --accept once (owner).`
		)
		current.forEach((m) => deps.error(`NEW   ${label(m)}`))
		return 1
	}
	return mode === '--update' ? update(current, baseline, rootDir, deps) : check(current, baseline, deps)
}
