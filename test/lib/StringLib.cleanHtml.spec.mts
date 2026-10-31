/**
 * cleanHtml / cleanHtmlUndefined: linear scanner vs old regex.
 *
 * Old impl `str.replace(/(<([^>]+)>)/gi, '')` quadratic on many `<` w/o `>` (ReDoS, CWE-1333).
 * New impl must give byte-identical output → old regex kept inline as ORACLE, never imported from src.
 * - exhaustive: every string ≤ 8 chars over ['<', '>', 'a', ' ', '\n'] (488281 strings)
 * - seeded random: longer strings, fixed seeds → reproducible, no flake
 * - perf: 100k then 1M reps of `<`, `<a` etc (50k for shapes that loop once per unit) must finish far under bound
 *   (generous, no tight timing)
 * - non-string input: TypeError like the old form, never a silent pass-through
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
	// Shapes where the scanner leaves the loop after 1 pass (no `>` at all, or 1 closing `>`): 2 sizes, in order.
	// Old regex: 80k `<` took ~1.9 s → GUARD_REPS ~3 s → fails here, never reaches REPS.
	// REPS sized for the other regression: indexOf is memchr (SIMD), so a rescan per `<` (dropped `break`,
	// resume at `open + 1` instead of `keepFrom`) costs only ~100 ms at 200k, ~2.4 s at 1M, still quadratic → bound
	// must sit far below that at REPS. Linear impl: ~1 ms at both sizes. Bound generous → no flake on slow CI.
	const GUARD_REPS = 100_000
	const REPS = 1_000_000
	// Shapes where the loop runs once per unit (`<>`, `<a>`, `<<>`): old regex is linear on them too, so they pin
	// output at scale, not the ReDoS. Stryker instrumentation puts dozens of mutant-switch calls in each pass
	// (~2 µs per pass in the dry run: 1M passes took 2.3 s) → keep small, else the dry run itself fails the bound.
	const LOOPING_REPS = 50_000
	const BOUND_MS = 500

	// best of 2: 1 stall (GC pause, loaded CI box) on a ms-scale run must not fail a linear impl.
	// Quadratic impl is over the bound on both attempts.
	function timedClean(input: string): { out: string; outUndefined: string | undefined; elapsed: number } {
		let result: { out: string; outUndefined: string | undefined; elapsed: number } = { out: '', outUndefined: '', elapsed: Infinity }
		for (let attempt = 0; attempt < 2 && result.elapsed >= BOUND_MS; attempt++) {
			const t0 = performance.now()
			const out = s.cleanHtml(input)
			const outUndefined = s.cleanHtmlUndefined(input)
			result = { out, outUndefined, elapsed: performance.now() - t0 }
		}

		return result
	}

	interface IShape {
		name: string
		build: (reps: number) => string
		// kept = unit is not a tag → output equals input. Else whole input stripped.
		kept: boolean
		// loop runs once per unit → small size only
		looping: boolean
	}

	const unit = (u: string, kept: boolean, looping: boolean): IShape => ({
		name: `${JSON.stringify(u)} repeated`,
		build: (reps) => u.repeat(reps),
		kept,
		looping
	})

	const shapes: IShape[] = [
		unit('<', true, false),
		unit('<>', true, true),
		unit('<a', true, false),
		unit('<a>', false, true),
		unit('<<>', false, true),
		unit('<\n', true, false),
		// 2-byte string: indexOf runs a different (slower) scan than on one-byte strings
		unit('<\u0100', true, false),
		{ name: '"<" repeated, closed by one ">" (single tag)', build: (reps) => '<'.repeat(reps) + '>', kept: false, looping: false },
		{ name: 'text, "<" repeated, text', build: (reps) => 'head' + '<'.repeat(reps) + 'tail', kept: true, looping: false }
	]

	for (const shape of shapes) {
		const sizes = shape.looping ? [LOOPING_REPS] : [GUARD_REPS, REPS]
		it(`${shape.name}: ${sizes.join(' then ')} reps, each under ${BOUND_MS} ms`, () => {
			for (const reps of sizes) {
				const input = shape.build(reps)
				const { out, outUndefined, elapsed } = timedClean(input)

				expect(elapsed, `reps=${reps}: elapsed ms`).to.be.lessThan(BOUND_MS)
				// boolean compare: huge strings, chai would print them all on failure
				expect(out === (shape.kept ? input : ''), `reps=${reps}: output (length ${out.length})`).to.equal(true)
				expect(outUndefined === out, `reps=${reps}: cleanHtmlUndefined differs from cleanHtml`).to.equal(true)
			}
		})
	}
})

describe('StringLib cleanHtml: non-string input fails closed', () => {
	// Old regex form threw TypeError for these (no `replace`). New scanner has indexOf + slice on array and Buffer →
	// without the check they come back unstripped = sanitizer turned pass-through for untyped input.
	const bad: Array<[string, unknown]> = [
		['array holding markup', ['<script>x</script>']],
		['Buffer holding markup', Buffer.from('<b>y</b>')],
		['object with indexOf and slice', { indexOf: () => -1, slice: () => '<i>z</i>' }],
		['number', 5],
		['boolean', true],
		['null', null]
	]

	for (const [label, value] of bad) {
		it(`${label} → TypeError, as the old regex form`, () => {
			expect(() => s.cleanHtml(value as never)).to.throw(TypeError, 'cleanHtml expects a string')
			expect(() => s.cleanHtmlUndefined(value as never)).to.throw(TypeError, 'cleanHtml expects a string')
			// oracle = old form: same refusal
			expect(() => oracle(value as never)).to.throw(TypeError)
		})
	}

	it('undefined: cleanHtml throws, cleanHtmlUndefined passes it through', () => {
		expect(() => s.cleanHtml(undefined as never)).to.throw(TypeError, 'cleanHtml expects a string')
		expect(s.cleanHtmlUndefined(undefined)).to.equal(undefined)
	})

	it('String object is accepted and gives a primitive string, like the old regex form', () => {
		// Object('x') = String wrapper; `new String` trips no-new-wrappers
		const wrapped: unknown = Object('<a>b<c>d')

		const out = s.cleanHtml(wrapped as never)
		const outUndefined = s.cleanHtmlUndefined(wrapped as never)

		expect(out).to.equal('bd')
		expect(typeof out).to.equal('string')
		expect(outUndefined).to.equal('bd')
		expect(oracle(wrapped as never)).to.equal('bd')
	})
})
