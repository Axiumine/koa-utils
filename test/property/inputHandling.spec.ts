// Property-based (fuzz) specs for pure input-handling guards. Ext `.ts` not `.mts` on purpose:
// OpenSSF Scorecard Fuzzing check scan only `*.ts` / `*.tsx` for a `fast-check` import.
// Adds no coverage → gate + thresholds untouched. Cross-file by design → no `src/` mirror.
import { checkEmailLen } from '@lib/checkEmailLen.mjs'
import { checkPwdLen } from '@lib/checkPwdLen.mjs'
import { EMAIL_MAX_LEN, MAX_PWD_LENGTH, MIN_PWD_LENGTH } from '@lib/Constants.mjs'
import { isSafeRedirectTarget } from '@lib/isSafeRedirectTarget.mjs'
import { isValidUuidV4 } from '@lib/isValidUuidV4.mjs'
import { StringLib } from '@lib/StringLib.mjs'
import { expect } from 'chai'
import fc from 'fast-check'
import { validate as uuidValidate, version as uuidVersion } from 'uuid'

import { validateExtension } from '../../dist/files/validateExtension.mjs'
import { assertNoTraversal } from '../../dist/private/files/assertNoTraversal.mjs'

// Fail → fast-check print seed + path. Replay: `fc.assert(prop, { seed, path })`.
// Deeper local fuzz: `FC_NUM_RUNS=100000 yarn test`.
const RUNS = { numRuns: Number(process.env.FC_NUM_RUNS ?? 500) }

const ORIGIN = 'https://app.example'
const REDIRECT_CHARS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-%/']
const redirectTail = fc.array(fc.constantFrom(...REDIRECT_CHARS), { minLength: 1, maxLength: 40 }).map((a) => a.join(''))
const junk = fc.string({ unit: 'binary', maxLength: 60 })

describe('property: isSafeRedirectTarget', () => {
	// Accepted target must never leave own origin. Attacker string = raw junk, junk after prefix,
	// allowed charset after prefix, known trap prefixes.
	it('never accepts a target that resolves off-origin', () => {
		const candidate = fc.oneof(
			junk,
			junk.map((s) => '/x/' + s),
			redirectTail.map((s) => '/x/' + s),
			fc.constantFrom('//', '/\\', '/x//', '/x/\\', '\\\\').chain((p) => junk.map((s) => p + s))
		)
		fc.assert(
			fc.property(candidate, (value) => {
				if (isSafeRedirectTarget(value)) {
					expect(new URL(value, ORIGIN).origin).to.equal(ORIGIN)
				}
			}),
			RUNS
		)
	})

	it('accepts every non-empty tail of the allowed charset under /x/', () => {
		fc.assert(
			fc.property(redirectTail, (tail) => isSafeRedirectTarget('/x/' + tail)),
			RUNS
		)
	})

	it('rejects any tail holding a char outside the allowed charset', () => {
		const forbidden = fc
			.string({ unit: 'binary', minLength: 1, maxLength: 20 })
			.filter((s) => [...s].some((c) => !REDIRECT_CHARS.includes(c)))
		fc.assert(
			fc.property(redirectTail, forbidden, (head, bad) => !isSafeRedirectTarget('/x/' + head + bad)),
			RUNS
		)
	})

	it('rejects anything without the literal /x/ prefix', () => {
		fc.assert(
			fc.property(
				junk.filter((s) => !s.startsWith('/x/')),
				(value) => !isSafeRedirectTarget(value)
			),
			RUNS
		)
	})
})

describe('property: isValidUuidV4', () => {
	it('accepts every v4 uuid, any letter case', () => {
		fc.assert(
			fc.property(fc.uuid({ version: 4 }), fc.boolean(), (id, upper) => isValidUuidV4(upper ? id.toUpperCase() : id)),
			RUNS
		)
	})

	// Cross-check vs independent impl: accepted → `uuid` pkg agree, version nibble 4.
	it('agrees with the uuid package on every accepted string', () => {
		fc.assert(
			fc.property(fc.oneof(junk, fc.uuid(), fc.uuid({ version: 4 })), (value) => {
				if (isValidUuidV4(value)) {
					expect(uuidValidate(value)).to.equal(true)
					expect(uuidVersion(value)).to.equal(4)
				}
			}),
			RUNS
		)
	})

	// Anchors must hold → no key-suffix smuggling into Redis key.
	it('rejects a valid uuid with any non-empty prefix or suffix', () => {
		fc.assert(
			fc.property(fc.uuid({ version: 4 }), fc.string({ unit: 'binary', minLength: 1, maxLength: 10 }), (id, extra) => {
				expect(isValidUuidV4(id + extra)).to.equal(false)
				expect(isValidUuidV4(extra + id)).to.equal(false)
			}),
			RUNS
		)
	})
})

describe('property: assertNoTraversal', () => {
	const separator = fc.constantFrom('/', '\\')
	const safeSegment = fc.string({ maxLength: 12 }).filter((s) => s !== '..' && !/[\\/]/.test(s))
	const join = (segments: string[], seps: string[]) => segments.map((s, i) => (i === 0 ? s : seps[i % seps.length] + s)).join('')

	it('never throws when no path component equals ..', () => {
		fc.assert(
			fc.property(
				fc.array(safeSegment, { maxLength: 6 }),
				fc.array(separator, { minLength: 1, maxLength: 6 }),
				(segments, seps) => {
					expect(() => assertNoTraversal(join(segments, seps), 'folder')).to.not.throw()
				}
			),
			RUNS
		)
	})

	it('always throws when a path component equals .., wherever it sits', () => {
		fc.assert(
			fc.property(
				fc.array(safeSegment, { maxLength: 6 }),
				fc.nat(6),
				fc.array(separator, { minLength: 1, maxLength: 7 }),
				(segments, at, seps) => {
					const withDots = [...segments]
					withDots.splice(Math.min(at, withDots.length), 0, '..')
					expect(() => assertNoTraversal(join(withDots, seps), 'folder')).to.throw('Invalid folder: path traversal')
				}
			),
			RUNS
		)
	})
})

describe('property: checkEmailLen / checkPwdLen', () => {
	const throws = (fn: () => void) => {
		try {
			fn()
			return false
		} catch {
			return true
		}
	}

	it('checkEmailLen throws exactly when empty or longer than EMAIL_MAX_LEN', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: EMAIL_MAX_LEN + 40 }), (email) => {
				const mustThrow = email === '' || email.length > EMAIL_MAX_LEN
				expect(throws(() => checkEmailLen(email))).to.equal(mustThrow)
			}),
			RUNS
		)
	})

	it('checkPwdLen throws exactly outside [MIN_PWD_LENGTH, MAX_PWD_LENGTH]', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: MAX_PWD_LENGTH + 40 }), (password) => {
				const mustThrow = password.length < MIN_PWD_LENGTH || password.length > MAX_PWD_LENGTH
				expect(throws(() => checkPwdLen(password))).to.equal(mustThrow)
			}),
			RUNS
		)
	})
})

describe('property: validateExtension', () => {
	const stem = fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !/[./\\]/.test(s))
	const ext = fc.constantFrom('.jpg', '.png', '.pdf', '.webp')

	it('accepts a stem plus an allowed extension in any letter case', () => {
		fc.assert(
			fc.property(stem, ext, fc.boolean(), (name, e, upper) => validateExtension(name + (upper ? e.toUpperCase() : e), [e])),
			RUNS
		)
	})

	it('accepted name always ends with one of the allowed extensions', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 30 }), fc.array(ext, { maxLength: 4 }), (name, allowed) => {
				if (validateExtension(name, allowed)) {
					expect(allowed.some((e) => name.toLowerCase().endsWith(e))).to.equal(true)
				}
			}),
			RUNS
		)
	})

	it('empty allowlist rejects every name', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 30 }), (name) => !validateExtension(name, [])),
			RUNS
		)
	})
})

describe('property: StringLib random generators', () => {
	const s = new StringLib()

	it('randomString returns max(0, n) chars, all from the base36 subset', () => {
		fc.assert(
			fc.property(fc.integer({ min: -5, max: 200 }), (n) => {
				const out = s.randomString(n)
				expect(out).to.have.lengthOf(Math.max(0, n))
				expect(out).to.match(/^[0-9a-v]*$/)
			}),
			RUNS
		)
	})

	it('getRandomArbitrary stays in [min, max), or returns min on an empty range', () => {
		fc.assert(
			fc.property(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (a, b) => {
				const out = s.getRandomArbitrary(a, b)
				if (b <= a) {
					expect(out).to.equal(a)
				} else {
					expect(out).to.be.at.least(a)
					expect(out).to.be.below(b)
				}
			}),
			RUNS
		)
	})
})
