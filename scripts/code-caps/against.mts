// Anti-laundering check: the committed ratchet files may only get stricter than a reference commit (default origin/main).
// Pure compare plus a git reader behind an interface, so the specs can inject a fake or use a temp repo.
import { spawnSync } from 'node:child_process'

import { CapsError } from './errors.mts'

export const DEFAULT_REF = 'origin/main'
// Both files are ratchets: a number here is debt the repo tolerates. Higher or new is laundering, lower or gone is progress.
export const RATCHET_FILES = ['.code-caps-baseline.json', 'eslint-suppressions.json'] as const

export interface RefReader {
	resolves: (ref: string) => boolean
	// File content at `ref`, or undefined when the ref has no such file at all. Throws CapsError on any other git failure.
	show: (ref: string, path: string) => string | undefined
}

// A ref starting with `-` would read as a git option; the rest is the usual ref alphabet (including `~`, `^`, `@`).
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/@^~-]*$/

export function isSafeRef(ref: string): boolean {
	return SAFE_REF.test(ref)
}

function git(cwd: string, args: string[]): string {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
	if (result.status !== 0) {
		throw new CapsError(`git ${args.join(' ')} failed: ${[result.stderr, result.error].join(' ').trim()}`)
	}
	return result.stdout
}

export function gitReader(cwd: string): RefReader {
	return {
		resolves: (ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd }).status === 0,
		show: (ref, path) => {
			// ls-tree answers "is this path in the ref" with exit 0 either way; `git show` alone would mix "missing" with real errors.
			if (git(cwd, ['ls-tree', '--name-only', ref, '--', path]).trim() === '') {
				return undefined
			}
			return git(cwd, ['show', `${ref}:${path}`])
		}
	}
}

// Every number in a JSON document, keyed by its path. Covers both file shapes: the flat caps baseline
// (`key -> value`) and the ESLint suppressions (`file -> rule -> count`). Non-numbers carry no debt and are skipped.
export function flattenNumbers(text: string, source: string): Map<string, number> {
	let data: unknown
	try {
		data = JSON.parse(text)
	} catch (cause) {
		throw new CapsError(`${source} is not valid JSON: ${(cause as Error).message}`)
	}
	const out = new Map<string, number>()
	const walk = (node: unknown, trail: string[]): void => {
		if (typeof node === 'number') {
			out.set(trail.join(' > '), node)
		} else if (typeof node === 'object' && node !== null) {
			Object.entries(node).forEach(([key, child]) => walk(child, [...trail, key]))
		}
	}
	walk(data, [])
	return out
}

// Violations of the rule "no new key, no higher value". A file the ref does not have at all is a first introduction: allowed.
export function compareToRef(
	file: string,
	current: Map<string, number>,
	base: Map<string, number> | undefined,
	ref: string
): string[] {
	if (base === undefined) {
		return []
	}
	const problems: string[] = []
	for (const [key, value] of current) {
		const allowed = base.get(key)
		if (allowed === undefined) {
			problems.push(`NEW    ${file}: ${key} = ${value} (not in ${ref}: fix the code, do not add debt)`)
		} else if (value > allowed) {
			problems.push(`HIGHER ${file}: ${key} = ${value} (${ref} has ${allowed}: shrink it back)`)
		}
	}
	return problems
}
