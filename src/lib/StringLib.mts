import { randomBytes, randomInt } from 'node:crypto'

// 32 chars, a subset of base36. 256 % 32 === 0 so a byte maps uniformly with % 32.
const RANDOM_ALPHABET = '0123456789abcdefghijklmnopqrstuv'

/**
 * Removes every `<...>` tag from `str` in linear time.
 *
 * Output is identical, for every string, to the regex this replaces: `str.replace(/(<([^>]+)>)/gi, '')`.
 * That regex is quadratic (ReDoS, CWE-1333): on input with many `<` and no `>`, each `<` makes the engine
 * scan to the end of the string before it fails, so n characters cost n^2 steps (80k characters took ~1.9 s).
 *
 * Reference semantics, kept exactly:
 * - A tag starts at a `<` and needs at least one character that is not `>` (a newline counts), then a `>`.
 *   Hence `<>` is not a tag, while `<\n>` is.
 * - Tags are non-overlapping and found left to right. A `<` inside a tag is consumed with it (`<<a>` -> ``).
 * - A `<` with no later `>` starts nothing, and neither does any `<` after it, so the rest is kept verbatim.
 *
 * Algorithm: for a `<` at `open`, the first `>` after it is at `close`. The characters between them are all
 * non-`>` by construction, so `close > open + 1` is exactly the regex condition.
 * - `close === -1`: no `>` exists at or after `open`, so no tag can start here or later. Stop.
 * - `close === open + 1`: the text is `<>`, not a tag. Resume the search for `<` at `close`.
 * - otherwise: drop `open..close`, resume the search for `<` after `close`.
 *
 * Termination and cost: `open` and `keepFrom` only move forward and every iteration advances `open` past its
 * previous value (to a `<` strictly after `open`, or to -1). Each `indexOf('<')` call starts where the previous
 * one stopped, and each `indexOf('>')` call either returns at once (the `<>` case, one character) or its scan
 * ends at `close`, from where the next `<` search resumes. No character is scanned twice by the same search, so
 * the total work is O(n). The single failing `indexOf('>')` (`close === -1`) ends the loop.
 */
function stripTags(str: string): string {
	let out = ''
	let keepFrom = 0
	let open = str.indexOf('<')
	while (open !== -1) {
		const close = str.indexOf('>', open + 1)
		if (close === -1) {
			break
		}
		if (close === open + 1) {
			open = str.indexOf('<', close)
		} else {
			out += str.slice(keepFrom, open)
			keepFrom = close + 1
			open = str.indexOf('<', keepFrom)
		}
	}

	return out + str.slice(keepFrom)
}

export class StringLib {
	// implements IStringLib
	constructor() {}

	cleanHtml(str: string): string {
		return stripTags(str)
	}

	cleanHtmlUndefined(str: string | undefined): string | undefined {
		return typeof str === 'undefined' ? str : stripTags(str)
	}

	/**
	 * Cryptographically random string of `length` characters.
	 *
	 * This is the generator behind every password-reset hash and email-confirmation
	 * hash in the package (emailHash -> registerNewUser / setEmailHash, and resetPwd
	 * directly). It previously used Math.random(), which is NOT a CSPRNG: V8 implements
	 * it as xorshift128+, whose internal state is recoverable from a modest number of
	 * observed outputs, after which every future value is predictable. An attacker could
	 * request a reset for an account they control, read their own hash from the email,
	 * recover the generator state, and predict the hash issued next — then trigger a
	 * reset for a victim and use the predicted token. The 50-character length gave no
	 * protection: entropy is bounded by the generator, not by the output length.
	 *
	 * The alphabet is 32 characters, a subset of the base36 output this has always
	 * produced, so callers matching /^[0-9a-z]+$/ are unaffected. 256 % 32 === 0, so
	 * mapping a byte with % 32 is uniform — no modulo bias, and no rejection branch.
	 * 5 bits per character: a 50-character hash carries 250 bits.
	 */
	randomString(length: number): string {
		const bytes = randomBytes(Math.max(0, length))
		let s = ''
		for (const b of bytes) {
			s += RANDOM_ALPHABET[b % RANDOM_ALPHABET.length]
		}

		return s
	}

	/**
	 * return OTP as string
	 * @returns {string}
	 */
	getRandomOTP(): string {
		return '' + this.getRandomArbitrary(100000, 999999)
	}

	/**
	 * Cryptographically random integer in [min, max).
	 *
	 * Also moved off Math.random(): this backs getRandomOTP(), and a predictable
	 * one-time password defeats the point of one.
	 *
	 * Uses crypto.randomInt rather than a hand-rolled modulo, which would over-represent
	 * the low end of the range. Hand-rolling the usual rejection loop was the first
	 * attempt, but its retry branch is statistically unreachable (~1 in 4 billion), so it
	 * could never be covered by a test — and an uncoverable branch is exactly what the
	 * coverage gate exists to refuse. randomInt does the same rejection inside Node.
	 */
	getRandomArbitrary(min: number, max: number) {
		const lo = Math.trunc(min)
		const range = Math.max(0, Math.trunc(max) - lo)
		if (range === 0) {
			return lo
		}

		return randomInt(lo, lo + range)
	}

	isoToTimestamp(isoStr: Date): number {
		// const date = new Date(isoStr)
		// return date.getTime()
		return isoStr.getTime()
	}

	isoFormatDMY(data: string): string {
		const d = new Date(data)
		return d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '/' + d.getUTCFullYear()
	}

	isoFormatDateTime(data: string): string {
		const d = new Date(data)
		return (
			d.getUTCDate() +
			'/' +
			(d.getUTCMonth() + 1) +
			'/' +
			d.getUTCFullYear() +
			' ' +
			d.getHours() +
			':' +
			(d.getMinutes() < 10 ? '0' : '') +
			d.getMinutes() +
			':' +
			(d.getSeconds() < 10 ? '0' : '') +
			d.getSeconds()
		)
	}

	makeLink(link: string, linkText: string = ''): string {
		return `<a target='_blank' href='${link}'>${linkText === '' ? link : linkText}</a>`
	}
} /* c8 ignore next */
