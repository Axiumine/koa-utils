/**
 * Tests for private/lib/access/safeEqualSecret.mts
 *
 * Contract: for 2 strings result = exactly `a === b`. Non-string either side → false (fail closed).
 * Compare run on sha256 digests → equal-length buffers whatever input length → no throw from
 * timingSafeEqual, no length leak.
 *
 * Mutants pinned here:
 * - lone surrogates: UTF-8 encode map every lone surrogate to U+FFFD → 2 different strings share a
 *   digest → compare true. Digest must use utf16le → 'utf16le' mutant to default die only on these.
 * - `||` → `&&` in type guard: digest(undefined) throw TypeError → pair with 1 non-string side die.
 */
import { safeEqualSecret } from '@private/lib/access/safeEqualSecret.mjs'
import { expect } from 'chai'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('safeEqualSecret', () => {
	afterEach(() => {
		sinon.restore()
		syncBuiltinESMExports()
	})

	it('equal strings → true', () => {
		expect(safeEqualSecret('correctHash', 'correctHash')).to.equal(true)
	})

	it('same length, 1 char differs → false', () => {
		expect(safeEqualSecret('correctHash', 'correctHasH')).to.equal(false)
	})

	it('different length: strict prefix either way → false, no throw', () => {
		expect(safeEqualSecret('correctHash', 'correctHas')).to.equal(false)
		expect(safeEqualSecret('correctHas', 'correctHash')).to.equal(false)
	})

	it('empty vs empty → true, empty vs non-empty → false', () => {
		expect(safeEqualSecret('', '')).to.equal(true)
		expect(safeEqualSecret('', 'x')).to.equal(false)
		expect(safeEqualSecret('x', '')).to.equal(false)
	})

	it('fail closed: undefined on either side → false, undefined vs undefined too', () => {
		expect(safeEqualSecret(undefined, 'x')).to.equal(false)
		expect(safeEqualSecret('x', undefined)).to.equal(false)
		expect(safeEqualSecret(undefined, undefined)).to.equal(false)
	})

	it('fail closed: null on either side → false, null vs null too', () => {
		expect(safeEqualSecret(null, 'x')).to.equal(false)
		expect(safeEqualSecret('x', null)).to.equal(false)
		expect(safeEqualSecret(null, null)).to.equal(false)
	})

	it('fail closed: number, object, Buffer never equal a string, even same text', () => {
		expect(safeEqualSecret(1234, '1234')).to.equal(false)
		expect(safeEqualSecret('1234', 1234)).to.equal(false)
		expect(safeEqualSecret({ toString: () => 'x' }, 'x')).to.equal(false)
		expect(safeEqualSecret('x', Buffer.from('x'))).to.equal(false)
	})

	it('multi-byte: equal → true, different → false', () => {
		expect(safeEqualSecret('pässwörd-日本語-🔑', 'pässwörd-日本語-🔑')).to.equal(true)
		expect(safeEqualSecret('pässwörd-日本語-🔑', 'pässwörd-日本語-🗝')).to.equal(false)
	})

	it('multi-byte: precomposed vs decomposed é are different strings → false, like ===', () => {
		// string widen: TS see NFC vs NFD literals as no-overlap
		expect(('é' as string) === 'é').to.equal(false)
		expect(safeEqualSecret('é', 'é')).to.equal(false)
	})

	it('lone surrogates: 2 different ones are different → false, same one equal → true', () => {
		// UTF-8 would turn both into U+FFFD → equal digests
		expect(safeEqualSecret('\ud800', '\udfff')).to.equal(false)
		expect(safeEqualSecret('a\ud800b', 'a\udfffb')).to.equal(false)
		expect(safeEqualSecret('\ud800', '\ud800')).to.equal(true)
	})

	it('lone surrogate never equals the replacement character it would encode to', () => {
		expect(safeEqualSecret('\ud800', '�')).to.equal(false)
	})

	it('result equals === on a matrix of string pairs', () => {
		const samples = ['', 'a', 'A', 'ab', 'abc', 'abd', ' abc', 'abc ', '0', '00', 'é', 'é', '\ud800', '�', '日本']
		for (const a of samples) {
			for (const b of samples) {
				expect(safeEqualSecret(a, b), JSON.stringify([a, b])).to.equal(a === b)
			}
		}
	})

	it('hands timingSafeEqual 2 digests of 32 bytes each whatever the input length, never the raw secret', () => {
		const spy = sinon.stub(crypto, 'timingSafeEqual').callsFake(() => true)
		syncBuiltinESMExports()

		safeEqualSecret('short', 'a-much-longer-secret-than-the-first-one')

		expect(spy.calledOnce).to.equal(true)
		const [left, right] = spy.firstCall.args as [Buffer, Buffer]
		expect(left.length).to.equal(32)
		expect(right.length).to.equal(32)
		expect(left.equals(Buffer.from('short'))).to.equal(false)
		expect(left.equals(right)).to.equal(false)
	})

	it('no timingSafeEqual call when a side is not a string', () => {
		const spy = sinon.stub(crypto, 'timingSafeEqual').callsFake(() => true)
		syncBuiltinESMExports()

		expect(safeEqualSecret(undefined, 'x')).to.equal(false)
		expect(safeEqualSecret('x', null)).to.equal(false)

		expect(spy.called).to.equal(false)
	})
})
