/**
 * Tests for lib/access/createMailThrottle.mts
 *
 * What this protects: every notification the verify-email chain sends is reachable from an unauthenticated
 * GET, and three of the guards have no strike counter behind them. Without a debounce, one address plus a
 * loop is a mail bomb sent by the platform's own SocketLabs account. The window is asserted from both
 * sides — a throttle that never opens again would silently mute real notifications.
 *
 * Clock is faked: the module reads Date.now(), so the window is driven rather than waited on.
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
		// exactly at the boundary: now - previous === windowMs is no longer "inside"
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

		// b survived the sweep, so it is still blocked; a was swept, so it is sendable again
		expect(maySend('b')).to.equal(false)
		expect(maySend('a')).to.equal(true)
	})

	it('when every tracked key is still inside its window, the oldest is evicted rather than refusing', () => {
		const maySend = createMailThrottle({ windowMs: 10_000, maxKeys: 2 })

		expect(maySend('old')).to.equal(true)
		clock.tick(100)
		expect(maySend('recent')).to.equal(true)

		// Map is full and nothing is expired. A flood of new addresses must not be able to mute a real
		// one by refusing sends, so the oldest window is dropped instead.
		expect(maySend('flood')).to.equal(true)
		// the newer window survived...
		expect(maySend('recent')).to.equal(false)
		// ...and the evicted one is sendable again
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
		// a is re-inserted, so it is now the NEWEST entry, not the oldest
		expect(maySend('a')).to.equal(true)
		expect(maySend('b')).to.equal(true)

		// full and fresh → the oldest (a, re-inserted before b) goes
		expect(maySend('c')).to.equal(true)
		expect(maySend('b')).to.equal(false)
	})
})

describe('ALWAYS_MAIL', () => {
	it('never debounces — the pre-5.6.2 behaviour, available as an opt-out', () => {
		expect(ALWAYS_MAIL('k')).to.equal(true)
		expect(ALWAYS_MAIL('k')).to.equal(true)
	})
})
