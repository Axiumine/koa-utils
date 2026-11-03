// Pure ratchet logic: compare current measurements with the committed baseline. No fs, no console.
import { LIMITS, type Measurement } from './measure.mts'

// Baseline = flat map `cap|path|symbol` -> value. No line numbers, so edits elsewhere never move a key.
export type Baseline = Record<string, number>

export interface Verdict {
	added: Measurement[]
	grown: { measurement: Measurement; baseline: number }[]
	stale: { key: string; measurement: Measurement | undefined; baseline: number }[]
}

export function keyOf(m: Pick<Measurement, 'cap' | 'path' | 'symbol'>): string {
	return `${m.cap}|${m.path}|${m.symbol}`
}

export function toBaseline(measurements: Measurement[]): Baseline {
	const entries: [string, number][] = measurements.map((m) => [keyOf(m), m.value])
	return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b, 'en')))
}

export function parseBaseline(text: string): Baseline {
	const data: unknown = JSON.parse(text)
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		throw new Error('baseline must be a JSON object of key -> number')
	}
	for (const [key, value] of Object.entries(data)) {
		if (!Number.isInteger(value) || value < 1) {
			throw new Error(`baseline value for ${key} must be a positive integer`)
		}
	}
	return data as Baseline
}

export function serializeBaseline(baseline: Baseline): string {
	return `${JSON.stringify(baseline, null, '\t')}\n`
}

// new key -> fail; value above baseline -> fail; value below baseline or key gone -> STALE (fail, lock the gain in); equal -> ok.
export function compare(current: Measurement[], baseline: Baseline): Verdict {
	const verdict: Verdict = { added: [], grown: [], stale: [] }
	const keys = new Set<string>()
	for (const measurement of current) {
		const key = keyOf(measurement)
		keys.add(key)
		const allowed = baseline[key]
		if (allowed === undefined) {
			verdict.added.push(measurement)
		} else if (measurement.value > allowed) {
			verdict.grown.push({ measurement, baseline: allowed })
		} else if (measurement.value < allowed) {
			verdict.stale.push({ key, measurement, baseline: allowed })
		}
	}
	for (const [key, allowed] of Object.entries(baseline)) {
		if (!keys.has(key)) {
			verdict.stale.push({ key, measurement: undefined, baseline: allowed })
		}
	}
	return verdict
}

export function isClean(verdict: Verdict): boolean {
	return verdict.added.length === 0 && verdict.grown.length === 0 && verdict.stale.length === 0
}

// `--update`: only ever lowers a value or drops a vanished key. Never adds a key, never raises a value.
export function lower(current: Measurement[], baseline: Baseline): Baseline {
	const now = new Map(current.map((m) => [keyOf(m), m.value]))
	const next: Baseline = {}
	for (const [key, allowed] of Object.entries(baseline)) {
		const value = now.get(key)
		if (value !== undefined) {
			next[key] = Math.min(value, allowed)
		}
	}
	return next
}

export function label(m: Measurement): string {
	return `${m.cap} ${m.path} ${m.symbol} ${m.value}>${LIMITS[m.cap]}`
}

export function formatVerdict(verdict: Verdict): string[] {
	const lines: string[] = []
	for (const m of verdict.added) {
		lines.push(`NEW   ${label(m)} (not in baseline: fix the code, do not baseline new debt)`)
	}
	for (const { measurement, baseline } of verdict.grown) {
		lines.push(`GROWN ${label(measurement)} (baseline ${baseline}: shrink it back)`)
	}
	for (const { key, measurement, baseline } of verdict.stale) {
		const what = measurement === undefined ? `${key.replaceAll('|', ' ')} gone` : label(measurement)
		lines.push(`STALE ${what} (baseline ${baseline}): run yarn caps:update`)
	}
	return lines
}
