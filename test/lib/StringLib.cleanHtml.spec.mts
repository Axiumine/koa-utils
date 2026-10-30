/**
 * cleanHtml / cleanHtmlUndefined: linear scanner vs old regex.
 *
 * Old impl `str.replace(/(<([^>]+)>)/gi, '')` quadratic on many `<` w/o `>` (ReDoS, CWE-1333).
 * New impl must give byte-identical output → old regex kept inline as ORACLE, never imported from src.
 * - exhaustive: every string ≤ 8 chars over ['<', '>', 'a', ' ', '\n'] (488281 strings)
 * - seeded random: longer strings, fixed seeds → reproducible, no flake
 * - perf: 200k reps of `<`, `<>`, `<a` etc must finish far under bound (generous, no tight timing)
 * Oracle itself only fed short strings: on long `<` runs it is the quadratic one.
 */
import { StringLib } from '@lib/StringLib.mjs'
import { expect } from 'chai'

const s = new StringLib()

// ORACLE: verbatim old regex. Do not "fix" or simplify.
const oracle = (str: string): string => str.replace(/(<([^>]+)>)/gi, '')

const ALPHABET = ['<', '>', 'a', ' ', '\n']
const MAX_EXHAUSTIVE_LEN = 8

// sum 5^0..5^8. Pin count → enumeration cannot silently shrink.
const EXHAUSTIVE_COUNT = 488281

// weight '<' + '>' double. lone surrogates = code-unit semantics (regex has no `u` flag).
const RANDOM_ALPHABET = ['<', '<', '>', '>', 'a', 'b', ' ', '\n', '\r', '/', '"', '=', '\ud83d', '\ude00']

const TOKENS = ['<', '>', '<>', '<<', '>>', '<a>', '</a>', '<br/>', '<a href="x">', '<p\n>', 'text', ' ', '\n', '<!--', '-->', '<script>']

// mulberry32: tiny seeded PRNG → same strings every run.
function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function* exhaustive(maxLen: number): Generator<string> {
	for (let len = 0; len <= maxLen; len++) {
		const total = ALPHABET.length ** len
		for (let k = 0; k < total; k++) {
			let n = k
			let str = ''
			for (let d = 0; d < len; d++) {
				str += ALPHABET[n % ALPHABET.length]
				n = Math.floor(n / ALPHABET.length)
			}
			yield str
		}
	}
}

interface IRandomSpec {
	seed: number
	count: number
	minLen: number
	maxLen: number
	pool: string[]
}

function* randomStrings({ seed, count, minLen, maxLen, pool }: IRandomSpec): Generator<string> {
	const rand = mulberry32(seed)
	for (let i = 0; i < count; i++) {
		const len = minLen + Math.floor(rand() * (maxLen - minLen + 1))
		let str = ''
		for (let c = 0; c < len; c++) {
			str += pool[Math.floor(rand() * pool.length)]
		}
		yield str
	}
}

// first input where impl differs from oracle, else undefined. Whole run cost = 1 oracle call + 1 impl call per input.
function firstMismatch(inputs: Iterable<string>, impl: (str: string) => string | undefined): string | undefined {
	for (const str of inputs) {
		if (impl(str) !== oracle(str)) {
			return str
		}
	}

	return undefined
}

describe('StringLib cleanHtml: fixed semantics', () => {
	const cases: Array<[string, string, string]> = [
		['strips nested-looking pair, inner < consumed', '<<a>', ''],
		['empty tag <> is not a tag', '<>', '<>'],
		['empty tag then text', 'a<>b', 'a<>b'],
		['<> then real tag', '<><a>', '<>'],
		['<> then > stays', '<>a>', '<>a>'],
		['newline only body is a tag', '<\n>', ''],
		['newline inside tag', '<a\nb>x', 'x'],
		['no > after <: rest verbatim', 'a<b', 'a<b'],
		['tag then dangling <', '<a>b<c', 'b<c'],
		['dangling < then tag-looking tail needs >', 'x<y<z', 'x<y<z'],
		['< inside tag consumed up to first >', '<a<b>c>', 'c>'],
		['lone > untouched', 'a>b', 'a>b'],
		['> before < untouched', '><a>', '>'],
		['two tags', '<a>1<b>2', '12'],
		['adjacent tags', '<a><b><c>', ''],
		['<> between tags', '<a><><b>', '<>'],
		['attribute with quote', '<a href="x>y">z', 'y">z'],
		['empty string', '', ''],
		['plain text', 'plain', 'plain'],
		['html doc', '<p>hello <b>world</b></p>', 'hello world'],
		['surrogate pair outside tag kept', '😀<a>😀', '😀😀'],
		['lone surrogate inside tag dropped', '<\ud83d>x', 'x']
	]

	for (const [name, input, expected] of cases) {
		it(`${name}: ${JSON.stringify(input)}`, () => {
			expect(s.cleanHtml(input)).to.equal(expected)
			expect(s.cleanHtmlUndefined(input)).to.equal(expected)
			expect(oracle(input)).to.equal(expected)
		})
	}

	it('cleanHtmlUndefined passes undefined through', () => {
		expect(s.cleanHtmlUndefined(undefined)).to.equal(undefined)
	})
})

describe('StringLib cleanHtml: differential vs old regex', () => {
	it('enumeration is the full 5^0..5^8 space, no duplicates', () => {
		const all = [...exhaustive(MAX_EXHAUSTIVE_LEN)]
		expect(all).to.have.lengthOf(EXHAUSTIVE_COUNT)
		expect(new Set(all).size).to.equal(EXHAUSTIVE_COUNT)
	})

	it('cleanHtml equals regex on every string ≤ 8 over < > a space newline', () => {
		expect(firstMismatch(exhaustive(MAX_EXHAUSTIVE_LEN), (str) => s.cleanHtml(str))).to.equal(undefined)
	})

	it('cleanHtmlUndefined equals regex on every string ≤ 6 over < > a space newline', () => {
		expect(firstMismatch(exhaustive(6), (str) => s.cleanHtmlUndefined(str))).to.equal(undefined)
	})

	it('cleanHtml equals regex on 100k seeded strings, len 9..48, <>-dense alphabet', () => {
		expect(firstMismatch(randomStrings({ seed: 0x5eed01, count: 100_000, minLen: 9, maxLen: 48, pool: ALPHABET }), (str) => s.cleanHtml(str))).to.equal(undefined)
	})

	it('cleanHtml equals regex on 100k seeded strings, len 9..48, wide alphabet incl lone surrogates', () => {
		expect(firstMismatch(randomStrings({ seed: 0x5eed02, count: 100_000, minLen: 9, maxLen: 48, pool: RANDOM_ALPHABET }), (str) => s.cleanHtml(str))).to.equal(undefined)
	})

	it('cleanHtml equals regex on 100k seeded strings built from html-ish tokens', () => {
		expect(firstMismatch(randomStrings({ seed: 0x5eed03, count: 100_000, minLen: 3, maxLen: 14, pool: TOKENS }), (str) => s.cleanHtml(str))).to.equal(undefined)
	})

	it('cleanHtmlUndefined equals regex on 20k seeded wide strings', () => {
		expect(firstMismatch(randomStrings({ seed: 0x5eed04, count: 20_000, minLen: 9, maxLen: 48, pool: RANDOM_ALPHABET }), (str) => s.cleanHtmlUndefined(str))).to.equal(undefined)
	})

	it('seeded generator is deterministic', () => {
		const first = [...randomStrings({ seed: 0x5eed01, count: 50, minLen: 9, maxLen: 48, pool: ALPHABET })]
		const second = [...randomStrings({ seed: 0x5eed01, count: 50, minLen: 9, maxLen: 48, pool: ALPHABET })]
		expect(first).to.deep.equal(second)
		expect(first.every((str) => str.length >= 9 && str.length <= 48)).to.equal(true)
	})
})

describe('StringLib cleanHtml: linear time (ReDoS CWE-1333 regression)', () => {
	const REPS = 200_000
	// old impl: 80k `<` took ~1.9 s, 200k would take ~12 s. Linear: few ms. Bound generous → no flake on slow CI.
	const BOUND_MS = 1000

	// [unit, kept]: kept = unit is not a tag → output equals input. Else whole input stripped.
	const units: Array<[string, boolean]> = [
		['<', true],
		['<>', true],
		['<a', true],
		['<a>', false],
		['<<>', false],
		['<\n', true]
	]

	for (const [unit, kept] of units) {
		it(`${REPS} x ${JSON.stringify(unit)} under ${BOUND_MS} ms`, () => {
			const input = unit.repeat(REPS)
			const t0 = performance.now()
			const out = s.cleanHtml(input)
			const outUndefined = s.cleanHtmlUndefined(input)
			const elapsed = performance.now() - t0

			expect(elapsed).to.be.lessThan(BOUND_MS)
			expect(out === (kept ? input : '')).to.equal(true)
			expect(outUndefined === out).to.equal(true)
		})
	}

	it(`${REPS} x "<" closed by one ">" is a single tag, under ${BOUND_MS} ms`, () => {
		const input = '<'.repeat(REPS) + '>'
		const t0 = performance.now()
		const out = s.cleanHtml(input)
		const elapsed = performance.now() - t0

		expect(elapsed).to.be.lessThan(BOUND_MS)
		expect(out).to.equal('')
	})

	it(`text, then ${REPS} x "<", then text, under ${BOUND_MS} ms`, () => {
		const input = 'head' + '<'.repeat(REPS) + 'tail'
		const t0 = performance.now()
		const out = s.cleanHtml(input)
		const elapsed = performance.now() - t0

		expect(elapsed).to.be.lessThan(BOUND_MS)
		expect(out === input).to.equal(true)
	})
})
