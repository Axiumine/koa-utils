/**
 * Tests for private/lib/access/assertResetAllowed.mts
 *
 * Every rejection = same 403 Forbidden → caller cannot tell unknown address, no pending reset, wrong
 * hash, expired link apart. Check order pinned by Sentry reports: orphan states report, plain wrong hash
 * and expiry stay silent.
 *
 * Branches:
 * - record null → 403, no Sentry
 * - resetHash null → 403 + Sentry "no usable resetHash"
 * - resetDateReq null (explicit null stored, getResetPwd pass it through) → 403 + Sentry "resetDateReq missing"
 * - hash wrong (differ, prefix, longer, empty) → 403, no Sentry
 * - link > 60 min → 403, exactly 60 min ok
 * - fresh + right hash → returns, no throw
 */
import { assertResetAllowed } from '@private/lib/access/assertResetAllowed.mjs'
import type { IResetPwdRecord } from '@private/lib/access/db/getResetPwd.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import { Types } from 'mongoose'

import { expectGraphQLErrorAsync } from '../../../helpers/assertGraphQLError.mjs'
import { ISentryProbe, startSentryProbe } from '../../../helpers/sentryProbeS2.mjs'
import { expectOneDigestCompare, releaseTimingSafeEqual, stubTimingSafeEqual } from '../../../helpers/timingSafeEqualProbe.mjs'

// ---------------------------------------------------------------------------

const NOW = new Date('2025-06-15T12:00:00.000Z')
const EMAIL = 'u@test.com'

const minutesAgo = (min: number) => new Date(NOW.getTime() - min * 60 * 1000)

function record(over: Partial<Record<keyof IResetPwdRecord, unknown>> = {}): IResetPwdRecord {
	return { _id: new Types.ObjectId(), resetDateReq: minutesAgo(1), resetHash: 'goodHash', name: 'Ann', ...over } as IResetPwdRecord
}

/** assert fn throw sync → wrap in async so expectGraphQLErrorAsync can await it */
const attempt = (rec: IResetPwdRecord | null, hash: string) => async () => {
	assertResetAllowed(rec, EMAIL, hash)
}

describe('assertResetAllowed', () => {
	let clock: sinon.SinonFakeTimers
	let probe: ISentryProbe

	beforeEach(async () => {
		clock = sinon.useFakeTimers({ now: NOW, toFake: ['Date'] })
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		clock.restore()
		releaseTimingSafeEqual()
	})

	it('no record → 403, nothing reported', async () => {
		await expectGraphQLErrorAsync(attempt(null, 'goodHash'), 403, 'Forbidden')
		await probe.flush()

		expect(probe.texts()).to.deep.equal([])
	})

	it('no usable hash → 403 and the orphan state reported', async () => {
		await expectGraphQLErrorAsync(attempt(record({ resetHash: null }), 'anything'), 403, 'Forbidden')
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['[updatePassword] no usable resetHash for u@test.com'])
	})

	it('hash set but date explicit null → 403 and the inconsistency reported', async () => {
		await expectGraphQLErrorAsync(attempt(record({ resetDateReq: null }), 'goodHash'), 403, 'Forbidden')
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['[updatePassword] resetHash set but resetDateReq missing for u@test.com'])
	})

	it('hash null is checked before the date: both missing → hash report only', async () => {
		await expectGraphQLErrorAsync(attempt(record({ resetHash: null, resetDateReq: null }), 'x'), 403, 'Forbidden')
		await probe.flush()

		expect(probe.texts()).to.deep.equal(['[updatePassword] no usable resetHash for u@test.com'])
	})

	for (const [label, sent] of [
		['different hash', 'otherHash'],
		['strict prefix of the stored hash', 'good'],
		['stored hash with 1 extra char', 'goodHash!'],
		['empty hash', ''],
		['literal "undefined"', 'undefined']
	] as const) {
		it(`wrong hash (${label}) → 403, nothing reported`, async () => {
			await expectGraphQLErrorAsync(attempt(record(), sent), 403, 'Forbidden')
			await probe.flush()

			expect(probe.texts()).to.deep.equal([])
		})
	}

	it('right hash but link 61 min old → 403', async () => {
		await expectGraphQLErrorAsync(attempt(record({ resetDateReq: minutesAgo(61) }), 'goodHash'), 403, 'Forbidden')
	})

	it('wrong hash is rejected before the age check: expired + wrong hash → still 403', async () => {
		await expectGraphQLErrorAsync(attempt(record({ resetDateReq: minutesAgo(600) }), 'otherHash'), 403, 'Forbidden')
	})

	it('right hash, link exactly 60 min old → allowed', () => {
		expect(() => assertResetAllowed(record({ resetDateReq: minutesAgo(60) }), EMAIL, 'goodHash')).to.not.throw()
	})

	it('right hash, fresh link → allowed', () => {
		expect(() => assertResetAllowed(record(), EMAIL, 'goodHash')).to.not.throw()
	})

	// Revert of the call site to `resetHash !== hash` keep every spec above green: same verdict per input.
	// Forced verdict split them → compare MUST go through safeEqualSecret → timingSafeEqual.
	it('constant-time compare: forced "equal" verdict allows a different hash, via 2 digests', () => {
		const probe = stubTimingSafeEqual(true)

		expect(() => assertResetAllowed(record(), EMAIL, 'otherHash')).to.not.throw()
		expectOneDigestCompare(probe)
	})

	it('constant-time compare: forced "different" verdict rejects the stored hash itself', async () => {
		const probe = stubTimingSafeEqual(false)

		await expectGraphQLErrorAsync(attempt(record(), 'goodHash'), 403, 'Forbidden')
		expectOneDigestCompare(probe)
	})

	it('string date from a custom reader is parsed: 5 min old ISO → allowed, 70 min old ISO → 403', async () => {
		expect(() => assertResetAllowed(record({ resetDateReq: minutesAgo(5).toISOString() }), EMAIL, 'goodHash')).to.not.throw()
		await expectGraphQLErrorAsync(attempt(record({ resetDateReq: minutesAgo(70).toISOString() }), 'goodHash'), 403, 'Forbidden')
	})
})
