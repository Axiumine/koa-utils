// Property spec: Postgres text parsers. Ext `.ts` on purpose: Scorecard Fuzzing scan `*.ts` only. No coverage role.
// Table specs in test/lib/PostgreSQL/parse/ own branch cover. Here: whole conversion vs Date (Date in test only, never in src)
import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { arrayOf } from '@lib/PostgreSQL/parse/arrayOf.mjs'
import { parseDate } from '@lib/PostgreSQL/parse/parseDate.mjs'
import { parseInt8 } from '@lib/PostgreSQL/parse/parseInt8.mjs'
import { parseTime } from '@lib/PostgreSQL/parse/parseTime.mjs'
import { parseTimestamptz } from '@lib/PostgreSQL/parse/parseTimestamptz.mjs'
import { parseUuid } from '@lib/PostgreSQL/parse/parseUuid.mjs'
import { expect } from 'chai'
import fc from 'fast-check'

// Fail → fast-check print seed + path. Replay: `fc.assert(prop, { seed, path })`.
// Deeper local fuzz: `FC_NUM_RUNS=100000 yarn test`. Cheap props → default above the 500 of other specs
const RUNS = { numRuns: Number(process.env['FC_NUM_RUNS'] ?? 500) }
const CONVERSION_RUNS = { numRuns: Number(process.env['FC_NUM_RUNS'] ?? 5000) }

const FIRST_MS = -62_135_596_800_000 // 0001-01-01T00:00:00Z
const LAST_MS = 253_402_300_799_999 // 9999-12-31T23:59:59.999Z
const TWO_DAYS_MS = 2 * 86_400_000

// Instant = integer µs since epoch → 2.5e17, past safe ints → BigInt. Text = how server print it in zone with given offset
function printedAs(epochMicros: bigint, offsetSeconds: number): string {
	const localMicros = epochMicros + BigInt(offsetSeconds) * 1_000_000n
	let localSeconds = localMicros / 1_000_000n
	let fraction = localMicros % 1_000_000n
	if (fraction < 0n) {
		localSeconds -= 1n
		fraction += 1_000_000n
	}
	const iso = new Date(Number(localSeconds) * 1000).toISOString()
	const fractionText = fraction === 0n ? '' : `.${String(fraction).padStart(6, '0').replace(/0+$/, '')}`
	const abs = Math.abs(offsetSeconds)
	const hours = String(Math.floor(abs / 3600)).padStart(2, '0')
	const minutes = String(Math.floor((abs % 3600) / 60)).padStart(2, '0')
	const seconds = String(abs % 60).padStart(2, '0')
	let offsetText = hours
	if (abs % 60 !== 0) offsetText = `${hours}:${minutes}:${seconds}`
	else if (abs % 3600 !== 0) offsetText = `${hours}:${minutes}`
	return `${iso.slice(0, 10)} ${iso.slice(11, 19)}${fractionText}${offsetSeconds < 0 ? '-' : '+'}${offsetText}`
}

describe('property: Postgres text parsers', () => {
	// Expected = integer ms part of µs count (toward zero), written by toISOString
	it('parseTimestamptz agrees with Date for random instants and offsets, µs cut toward zero', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: FIRST_MS + TWO_DAYS_MS, max: LAST_MS - TWO_DAYS_MS }),
				fc.integer({ min: 0, max: 999 }),
				fc.integer({ min: -14 * 3600, max: 14 * 3600 }),
				(epochMs, subMs, offsetSeconds) => {
					// µs = epochMs * 1000 + subMs → keep sign of epochMs. BigInt division truncate toward zero
					const micros = BigInt(epochMs) * 1000n + BigInt(subMs)
					const expected = new Date(Number(micros / 1000n)).toISOString()
					expect(parseTimestamptz(printedAs(micros, offsetSeconds))).to.equal(expected)
				}
			),
			CONVERSION_RUNS
		)
	})

	it('parseTimestamptz agrees with Date at both ends of the range and at the epoch', () => {
		for (const epochMs of [FIRST_MS, FIRST_MS + 1, -1, 0, 1, LAST_MS - 1, LAST_MS]) {
			expect(parseTimestamptz(printedAs(BigInt(epochMs) * 1000n, 0))).to.equal(new Date(epochMs).toISOString())
		}
	})

	it('arrayOf survives generated arrays of quoted strings with commas, quotes, braces and backslashes', () => {
		const parse = arrayOf((text) => text, 'text[]')
		fc.assert(
			fc.property(fc.array(fc.string({ maxLength: 12 }), { maxLength: 8 }), (items) => {
				const text = `{${items.map((item) => `"${item.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`
				expect(parse(text)).to.deep.equal(items)
			}),
			RUNS
		)
	})

	it('no parser throws anything but a DbParseError, for arbitrary text', () => {
		const parsers = [parseDate, parseTime, parseTimestamptz, parseInt8, parseUuid, arrayOf(parseDate, 'date[]')]
		fc.assert(
			fc.property(fc.string({ maxLength: 40 }), (text) => {
				for (const parse of parsers) {
					try {
						parse(text)
					} catch (error) {
						expect(error).to.be.instanceOf(DbParseError)
					}
				}
			}),
			{ numRuns: Number(process.env['FC_NUM_RUNS'] ?? 2000) }
		)
	})

	it('a DbParseError never holds the text: not in message, stack or JSON', () => {
		const planted = 'planted-value-7731'
		for (const parse of [parseDate, parseTime, parseTimestamptz, parseInt8, parseUuid, arrayOf(parseDate, 'date[]')]) {
			try {
				parse(planted)
			} catch (error) {
				const e = error as DbParseError
				expect(`${e.message} ${e.stack ?? ''} ${JSON.stringify(e)}`).to.not.contain(planted)
			}
		}
	})
})
