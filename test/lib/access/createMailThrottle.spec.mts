/**
 * Tests for lib/access/createMailThrottle.mts
 *
 * Protects: every notification the verify-email chain send is reachable from an
 * unauthenticated GET, 3 guards carry no strike counter. No debounce → 1 address +
 * a loop = mail bomb from the platform's own SocketLabs account. Window asserted
 * both sides — a throttle that never reopen would silently mute real notifications.
 *
 * Clock faked: module read Date.now() → window driven, not waited on.
 */
import { ALWAYS_MAIL, createMailThrottle } from '@lib/access/createMailThrottle.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

// ---------------------------------------------------------------------------

describe('createMailThrottle', () => {
	let clock: sinon.SinonFakeTimers

	beforeEach(() => {
		clock = sinon.useFakeTimers()
	})

	afterEach(() => {
		clock.restore()
		sinon.restore()
	})

	it('first send for a key is allowed, an immediate repeat is not', () => {
		const maySend = createMailThrottle({ windowMs: 1000 })

		expect(maySend('emailAlreadyValid:user@test.com')).to.equal(true)
		expect(maySend('emailAlreadyValid:user@test.com')).to.equal(false)
		expect(maySend('emailAlreadyValid:user@test.com')).to.equal(false)
	})

	it('keys are independent — one address does not mute another, nor another template', () => {
		const maySend = createMailThrottle({ windowMs: 1000 })

		expect(maySend('emailAlreadyValid:a@test.com')).to.equal(true)
		expect(maySend('emailAlreadyValid:b@test.com')).to.equal(true)
		expect(maySend('accountDisabled:a@test.com')).to.equal(true)
	})

	it('the window reopens once it has elapsed', () => {
		const maySend = createMailThrottle({ windowMs: 1000 })

		expect(maySend('k')).to.equal(true)
		clock.tick(999)
		expect(maySend('k')).to.equal(false)
		clock.tick(1)
		// at the boundary: now - previous === windowMs no longer "inside"
		expect(maySend('k')).to.equal(true)
	})

	it('defaults to a 15 minute window with no options at all', () => {
		const maySend = createMailThrottle()

		expect(maySend('k')).to.equal(true)
		clock.tick(15 * 60 * 1000 - 1)
		expect(maySend('k')).to.equal(false)
		clock.tick(1)
		expect(maySend('k')).to.equal(true)
	})

	it('at maxKeys, expired entries are swept and fresh ones survive the sweep', () => {
		const maySend = createMailThrottle({ windowMs: 1000, maxKeys: 2 })

		expect(maySend('a')).to.equal(true)
		clock.tick(600)
		expect(maySend('b')).to.equal(true)
		clock.tick(600) // a is 1200ms old (expired), b is 600ms old (fresh)

		expect(maySend('c')).to.equal(true)

		// b survived the sweep → still blocked; a swept → sendable again
		expect(maySend('b')).to.equal(false)
		expect(maySend('a')).to.equal(true)
	})

	it('when every tracked key is still inside its window, the oldest is evicted rather than refusing', () => {
		const maySend = createMailThrottle({ windowMs: 10_000, maxKeys: 2 })

		expect(maySend('old')).to.equal(true)
		clock.tick(100)
		expect(maySend('recent')).to.equal(true)

		// Map full, nothing expired. A flood of new addresses must not mute a real one by
		// refusing sends → oldest window dropped instead.
		expect(maySend('flood')).to.equal(true)
		// the newer window survived...
		expect(maySend('recent')).to.equal(false)
		// ...evicted one sendable again
		expect(maySend('old')).to.equal(true)
	})

	it('with maxKeys 0 there is nothing to evict, and the key is still tracked', () => {
		const maySend = createMailThrottle({ windowMs: 1000, maxKeys: 0 })

		expect(maySend('a')).to.equal(true)
		expect(maySend('a')).to.equal(false)
	})

	it('re-sending the same key after its window keeps the map ordered by send time', () => {
		const maySend = createMailThrottle({ windowMs: 1000, maxKeys: 2 })

		expect(maySend('a')).to.equal(true)
		clock.tick(1001)
		// a re-inserted → now the NEWEST entry, not the oldest
		expect(maySend('a')).to.equal(true)
		expect(maySend('b')).to.equal(true)

		// full + fresh → the oldest (a, re-inserted before b) goes
		expect(maySend('c')).to.equal(true)
		expect(maySend('b')).to.equal(false)
	})

	it('re-sending a key whose window lapsed moves it behind the keys sent after it', () => {
		const maySend = createMailThrottle({ windowMs: 1000, maxKeys: 3 })

		expect(maySend('a')).to.equal(true)
		clock.tick(500)
		expect(maySend('b')).to.equal(true)
		clock.tick(501) // a expired (1001ms), b fresh (501ms)
		// a re-sent while map not full (no sweep) → newest entry, b now oldest. No delete before set → Map keep a first.
		expect(maySend('a')).to.equal(true)
		expect(maySend('c')).to.equal(true)

		// full + all fresh → oldest goes. Must be b, not the re-inserted a.
		expect(maySend('d')).to.equal(true)
		expect(maySend('a')).to.equal(false)
		expect(maySend('b')).to.equal(true)
	})

	it('the sweep drops an expired entry sitting behind a live one, so the live window is not evicted', () => {
		const maySend = createMailThrottle({ windowMs: 100, maxKeys: 2 })

		clock.setSystemTime(1000)
		expect(maySend('live')).to.equal(true)
		// clock step back → map order (live, stale) ≠ timestamp order
		clock.setSystemTime(0)
		expect(maySend('stale')).to.equal(true)
		// now=100 → stale age === windowMs (expired), live age < 0 (inside window)
		clock.setSystemTime(100)
		expect(maySend('c')).to.equal(true)

		// sweep removed stale → size 1 < maxKeys → live kept. No sweep → oldest (live) evicted → true
		expect(maySend('live')).to.equal(false)
	})

	it('no sweep while the map is below maxKeys, so an aged entry survives a clock step back', () => {
		const maySend = createMailThrottle({ windowMs: 100, maxKeys: 3 })

		clock.setSystemTime(0)
		expect(maySend('a')).to.equal(true)
		// size 1 < maxKeys → no sweep. Sweep always → a (age === windowMs) dropped here
		clock.setSystemTime(100)
		expect(maySend('b')).to.equal(true)
		// clock step back → a age 50 < windowMs → still throttled. Dropped by early sweep → true
		clock.setSystemTime(50)
		expect(maySend('a')).to.equal(false)
	})
})

describe('ALWAYS_MAIL', () => {
	it('never debounces — the pre-5.6.2 behaviour, available as an opt-out', () => {
		expect(ALWAYS_MAIL('k')).to.equal(true)
		expect(ALWAYS_MAIL('k')).to.equal(true)
	})
})
