import { expect } from 'chai'

import { toyTracker } from '../../../helpers/toyLockSpec.mjs'

type TTracker = ReturnType<typeof toyTracker>

// lock on top rank, then ask for a low one: throws iff the check is on for that tx
function inversionThrows(tracker: TTracker, tx: object): boolean {
	tracker.record(tx, tracker.admit(tx, 'takeZeta'))
	try {
		tracker.admit(tx, 'takeAlpha')
		return false
	} catch (error) {
		expect(error).to.have.property('reason', 'RANK_INVERSION')
		return true
	}
}

describe('createLockOrderTracker: the rank check', () => {
	it('is on by default, in a tracker nobody configured', () => {
		expect(inversionThrows(toyTracker(), {})).to.equal(true)
	})

	it('is switched off by configure({ rankCheck: false }): an inversion and a mode mistake pass, nothing is thrown', () => {
		const tracker = toyTracker()
		tracker.configure({ rankCheck: false })
		const tx = {}
		expect(inversionThrows(tracker, tx)).to.equal(false)
		expect(tracker.admit(tx, 'takeOmega')).to.equal(undefined)
		const teardown = {}
		tracker.track(teardown, { mode: 'teardown' })
		expect(tracker.admit(teardown, 'takeDelta')).to.equal(undefined)
	})

	it('is on again after configure with nothing, with an empty object, or with true', () => {
		for (const config of [undefined, {}, { rankCheck: true }, { rankCheck: undefined }]) {
			const tracker = toyTracker()
			tracker.configure({ rankCheck: false })
			tracker.configure(config)
			expect(inversionThrows(tracker, {}), JSON.stringify(config)).to.equal(true)
		}
	})

	it('refuses a configuration that is not a boolean, and keeps the earlier one', () => {
		const tracker = toyTracker()
		tracker.configure({ rankCheck: false })
		for (const rankCheck of ['no', 0, null]) {
			const config = { rankCheck } as unknown as Parameters<TTracker['configure']>[0]
			expect(() => tracker.configure(config)).to.throw(TypeError, 'rankCheck must be a boolean')
		}
		expect(inversionThrows(tracker, {})).to.equal(false)
	})

	it('is forced on, for one transaction, against a default that is off', () => {
		const tracker = toyTracker()
		tracker.configure({ rankCheck: false })
		const tx = {}
		tracker.track(tx, { rankCheck: true })
		expect(inversionThrows(tracker, tx)).to.equal(true)
		expect(inversionThrows(tracker, {})).to.equal(false)
	})

	it('is forced off, for one transaction, against a default that is on', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.track(tx, { rankCheck: false })
		expect(inversionThrows(tracker, tx)).to.equal(false)
		expect(inversionThrows(tracker, {})).to.equal(true)
	})

	it('does not change a transaction that is already tracked', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.admit(tx, 'takeAlpha')
		tracker.configure({ rankCheck: false })
		expect(inversionThrows(tracker, tx)).to.equal(true)
	})

	it('applies the default at the time of track when track gives no rank check', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.admit(tx, 'takeAlpha')
		tracker.configure({ rankCheck: false })
		tracker.track(tx, { mode: 'standard' })
		expect(inversionThrows(tracker, tx)).to.equal(false)
	})

	it('still records the rank with the check off, so a later forced-on track is refused', () => {
		const tracker = toyTracker()
		tracker.configure({ rankCheck: false })
		const tx = {}
		tracker.record(tx, tracker.admit(tx, 'takeEpsilon'))
		expect(() => tracker.track(tx, { rankCheck: true })).to.throw('set before its first lock')
	})

	it('records only a rank that was admitted: with the check off a helper outside the mode records nothing', () => {
		const tracker = toyTracker()
		tracker.configure({ rankCheck: false })
		const tx = {}
		tracker.record(tx, tracker.admit(tx, 'takeOmega'))
		expect(() => tracker.track(tx, { mode: 'teardown' })).to.not.throw()
	})
})
