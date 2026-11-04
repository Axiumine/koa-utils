import { expect } from 'chai'

import { toyTracker } from '../../../helpers/toyLockSpec.mjs'

describe('createLockOrderTracker: hold and held', () => {
	it('answers 0 for a transaction that held nothing, one never tracked included', () => {
		const tracker = toyTracker()
		expect(tracker.held({}, 'row')).to.equal(0)
		const tx = {}
		tracker.admit(tx, 'takeAlpha')
		expect(tracker.held(tx, 'row')).to.equal(0)
	})

	it('answers the strength recorded under a key', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.hold(tx, 'row', 1)
		expect(tracker.held(tx, 'row')).to.equal(1)
		tracker.hold(tx, 'other', 2)
		expect(tracker.held(tx, 'other')).to.equal(2)
		expect(tracker.held(tx, 'row')).to.equal(1)
	})

	it('keeps the stronger lock: a weaker one never replaces it, a stronger one does', () => {
		const tracker = toyTracker()
		const strong = {}
		tracker.hold(strong, 'row', 2)
		tracker.hold(strong, 'row', 1)
		expect(tracker.held(strong, 'row')).to.equal(2)
		const rising = {}
		tracker.hold(rising, 'row', 1)
		tracker.hold(rising, 'row', 2)
		expect(tracker.held(rising, 'row')).to.equal(2)
		tracker.hold(rising, 'row', 2)
		expect(tracker.held(rising, 'row')).to.equal(2)
	})

	it('keeps the state per transaction handle and per tracker', () => {
		const one = toyTracker()
		const two = toyTracker()
		const tx = {}
		one.hold(tx, 'row', 2)
		expect(one.held({}, 'row')).to.equal(0)
		expect(two.held(tx, 'row')).to.equal(0)
	})

	it('records also when the rank check is off', () => {
		const tracker = toyTracker()
		tracker.configure({ rankCheck: false })
		const tx = {}
		tracker.hold(tx, 'row', 2)
		expect(tracker.held(tx, 'row')).to.equal(2)
		const forced = {}
		tracker.track(forced, { rankCheck: false })
		tracker.hold(forced, 'row', 1)
		expect(tracker.held(forced, 'row')).to.equal(1)
	})

	it('does not count as a rank: holding does not start the tracker', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.hold(tx, 'row', 2)
		expect(() => tracker.track(tx, { mode: 'teardown' })).to.not.throw()
		expect(tracker.held(tx, 'row')).to.equal(2)
	})

	it('is a read: held creates no state, so a configure after it still governs the transaction', () => {
		const tracker = toyTracker()
		const tx = {}
		expect(tracker.held(tx, 'row')).to.equal(0)
		tracker.configure({ rankCheck: false })
		tracker.record(tx, tracker.admit(tx, 'takeZeta'))
		expect(tracker.admit(tx, 'takeAlpha')).to.deep.equal({ rank: 1 })
	})

	it('refuses a strength that is not a whole number of at least 1, and records nothing', () => {
		const tracker = toyTracker()
		const tx = {}
		for (const strength of [0, -1, 1.5, Number.NaN, Infinity, '1' as unknown as number]) {
			expect(() => tracker.hold(tx, 'row', strength)).to.throw(TypeError, 'strength must be a whole number of at least 1')
		}
		expect(tracker.held(tx, 'row')).to.equal(0)
	})

	it('accepts a strength above 2', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.hold(tx, 'row', 5)
		expect(tracker.held(tx, 'row')).to.equal(5)
	})
})
