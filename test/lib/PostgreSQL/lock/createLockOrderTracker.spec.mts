import { createLockOrderTracker } from '@lib/PostgreSQL/lock/createLockOrderTracker.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'
import { STANDARD_HELPERS, TOY_SPEC, toyTracker } from '../../../helpers/toyLockSpec.mjs'

// one lock the way a helper does it: admit, then record (statement succeeded between)
function take(
	tracker: ReturnType<typeof toyTracker>,
	tx: object,
	helper: Parameters<ReturnType<typeof toyTracker>['admit']>[1]
): void {
	tracker.record(tx, tracker.admit(tx, helper))
}

describe('createLockOrderTracker: the standard order', () => {
	for (const first of STANDARD_HELPERS) {
		for (const second of STANDARD_HELPERS) {
			if (first.rank < second.rank) {
				it(`passes ${first.helper} then ${second.helper}`, () => {
					const tracker = toyTracker()
					const tx = {}
					take(tracker, tx, first.helper)
					expect(tracker.admit(tx, second.helper)).to.deep.equal({ rank: second.rank })
				})
			} else if (first.rank === second.rank) {
				it(`passes ${first.helper} twice (a repeated acquisition at the same rank)`, () => {
					const tracker = toyTracker()
					const tx = {}
					take(tracker, tx, first.helper)
					expect(tracker.admit(tx, second.helper)).to.deep.equal({ rank: second.rank })
				})
			} else {
				it(`throws ${second.helper} (rank ${String(second.rank)}) after ${first.helper} (rank ${String(first.rank)}), naming both ranks`, () => {
					const tracker = toyTracker()
					const tx = {}
					take(tracker, tx, first.helper)
					const error = thrownBy(() => tracker.admit(tx, second.helper))
					expect(error).to.deep.include({ name: 'LockOrderError', reason: 'RANK_INVERSION' })
					expect((error as Error).message).to.equal(
						`lock order violated: ${second.helper} takes rank ${String(second.rank)} (${second.name}) after rank ${String(first.rank)} (${first.name}) in the standard order`
					)
				})
			}
		}
	}

	it('records nothing at admit: a rank not recorded does not hold the later ones back', () => {
		const tracker = toyTracker()
		const tx = {}
		expect(tracker.admit(tx, 'takeZeta')).to.deep.equal({ rank: 6 })
		expect(tracker.admit(tx, 'takeAlpha')).to.deep.equal({ rank: 1 })
	})

	it('holds the highest rank, however many locks of lower ranks follow', () => {
		const tracker = toyTracker()
		const tx = {}
		take(tracker, tx, 'takeDelta')
		take(tracker, tx, 'takeDelta')
		expect(() => tracker.admit(tx, 'takeGamma')).to.throw('takes rank 3 (gamma) after rank 4 (delta)')
		take(tracker, tx, 'takeZeta')
		expect(() => tracker.admit(tx, 'takeEpsilon')).to.throw('takes rank 5 (epsilon) after rank 6 (zeta)')
	})

	it('keeps the highest rank when a lower admission is recorded after it', () => {
		const tracker = toyTracker()
		const tx = {}
		const low = tracker.admit(tx, 'takeBeta')
		take(tracker, tx, 'takeDelta')
		tracker.record(tx, low)
		expect(() => tracker.admit(tx, 'takeGamma')).to.throw('after rank 4 (delta)')
	})

	it('records nothing for undefined', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.record(tx, undefined)
		expect(() => tracker.track(tx, { mode: 'teardown' })).to.not.throw()
	})

	it('keeps the state per transaction handle', () => {
		const tracker = toyTracker()
		const first = {}
		take(tracker, first, 'takeZeta')
		expect(tracker.admit({}, 'takeAlpha')).to.deep.equal({ rank: 1 })
	})

	it("keeps the state per tracker: two trackers do not see each other's transactions", () => {
		const one = toyTracker()
		const two = toyTracker()
		const tx = {}
		take(one, tx, 'takeZeta')
		expect(two.admit(tx, 'takeAlpha')).to.deep.equal({ rank: 1 })
		expect(() => one.admit(tx, 'takeAlpha')).to.throw('lock order violated')
	})

	it('has no module-level state: a tracker made later starts clean on a handle another tracker used', () => {
		const tx = {}
		take(toyTracker(), tx, 'takeZeta')
		expect(toyTracker().admit(tx, 'takeAlpha')).to.deep.equal({ rank: 1 })
	})
})

describe('createLockOrderTracker: the other mode', () => {
	function teardown(): { tracker: ReturnType<typeof toyTracker>; tx: object } {
		const tracker = toyTracker()
		const tx = {}
		tracker.track(tx, { mode: 'teardown' })
		return { tracker, tx }
	}

	it('accepts its helpers in order, and a repeat at the same rank', () => {
		const { tracker, tx } = teardown()
		take(tracker, tx, 'takeBeta')
		take(tracker, tx, 'takeBeta')
		take(tracker, tx, 'takeGamma')
		take(tracker, tx, 'takeOmega')
		take(tracker, tx, 'takeOmega')
	})

	it('numbers its ranks from its own order, and says so in the inversion', () => {
		const { tracker, tx } = teardown()
		take(tracker, tx, 'takeOmega')
		const error = thrownBy(() => tracker.admit(tx, 'takeBeta'))
		expect(error).to.have.property('reason', 'RANK_INVERSION')
		expect((error as Error).message).to.equal(
			'lock order violated: takeBeta takes rank 1 (beta) after rank 3 (omega) in the teardown order'
		)
	})

	it('rejects a helper of the default order only: NOT_IN_MODE_ORDER, with the list of its locks', () => {
		for (const helper of ['takeAlpha', 'takeDelta', 'takeEpsilon', 'takeZeta'] as const) {
			const { tracker, tx } = teardown()
			const error = thrownBy(() => tracker.admit(tx, helper))
			expect(error).to.have.property('reason', 'NOT_IN_MODE_ORDER')
			expect((error as Error).message).to.equal(`${helper} is not one of the locks of the teardown order (beta, gamma, omega)`)
		}
	})

	it('rejects its helper in a transaction left in the default mode: MODE_REQUIRED', () => {
		const tracker = toyTracker()
		for (const tx of [
			{},
			(() => {
				const t = {}
				tracker.track(t, { mode: 'standard' })
				return t
			})()
		]) {
			const error = thrownBy(() => tracker.admit(tx, 'takeOmega'))
			expect(error).to.have.property('reason', 'MODE_REQUIRED')
			expect((error as Error).message).to.equal(
				'takeOmega belongs to the teardown order: set that mode on the transaction before its first lock'
			)
		}
	})

	it('lets a helper of both orders through in both', () => {
		expect(toyTracker().admit({}, 'takeBeta')).to.deep.equal({ rank: 2 })
		const { tracker, tx } = teardown()
		expect(tracker.admit(tx, 'takeBeta')).to.deep.equal({ rank: 1 })
	})
})

describe('createLockOrderTracker: track', () => {
	it('can be called before any lock, with or without options, and again', () => {
		const tracker = toyTracker()
		const tx = {}
		expect(() => {
			tracker.track(tx)
			tracker.track(tx, {})
			tracker.track(tx, { mode: 'teardown' })
			tracker.track(tx, { mode: 'standard', rankCheck: true })
		}).to.not.throw()
	})

	it('puts the transaction back in the default mode, with the default check, when called again with no options', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.track(tx, { mode: 'teardown', rankCheck: false })
		tracker.track(tx)
		take(tracker, tx, 'takeEpsilon')
		expect(() => tracker.admit(tx, 'takeAlpha')).to.throw('in the standard order')
	})

	it('throws TRACKER_STARTED once a lock is recorded, with the fixed message, and leaves the mode as it was', () => {
		const tracker = toyTracker()
		const tx = {}
		take(tracker, tx, 'takeAlpha')
		const error = thrownBy(() => tracker.track(tx, { mode: 'teardown' }))
		expect(error).to.deep.include({ name: 'LockOrderError', reason: 'TRACKER_STARTED' })
		expect((error as Error).message).to.equal('the lock order mode of a transaction is set before its first lock')
		expect(tracker.admit(tx, 'takeDelta')).to.deep.equal({ rank: 4 })
	})

	it('also refuses a call with no options after a lock, since it would reset the mode', () => {
		const tracker = toyTracker()
		const tx = {}
		take(tracker, tx, 'takeAlpha')
		expect(() => tracker.track(tx)).to.throw('set before its first lock')
	})

	it('allows the call after an admission that was never recorded (no lock was taken)', () => {
		const tracker = toyTracker()
		const tx = {}
		tracker.admit(tx, 'takeAlpha')
		expect(() => tracker.track(tx, { mode: 'teardown' })).to.not.throw()
	})

	it('refuses a mode that is not in the spec, and lists the modes', () => {
		const tracker = toyTracker()
		const options = { mode: 'exclusive' } as unknown as Parameters<typeof tracker.track>[1]
		const error = thrownBy(() => tracker.track({}, options))
		expect(error).to.be.instanceOf(TypeError)
		expect((error as Error).message).to.equal('mode must be one of standard, teardown')
	})

	it('refuses a mode with the name of an object property', () => {
		const tracker = toyTracker()
		for (const mode of ['toString', '__proto__', 'constructor', '']) {
			const options = { mode } as unknown as Parameters<typeof tracker.track>[1]
			expect(() => tracker.track({}, options)).to.throw(TypeError, 'mode must be one of')
		}
	})

	it('refuses a rank check that is not a boolean, falsy values included', () => {
		const tracker = toyTracker()
		for (const rankCheck of ['yes', 1, null, 0, '']) {
			const options = { rankCheck } as unknown as Parameters<typeof tracker.track>[1]
			expect(() => tracker.track({}, options)).to.throw(TypeError, 'rankCheck must be a boolean')
		}
	})

	it('checks the mode before the rank check, and both before touching the state', () => {
		const tracker = toyTracker()
		const tx = {}
		const both = { mode: 'nope', rankCheck: 'x' } as unknown as Parameters<typeof tracker.track>[1]
		expect(() => tracker.track(tx, both)).to.throw('mode must be one of')
		const badCheck = { mode: 'teardown', rankCheck: 'x' } as unknown as Parameters<typeof tracker.track>[1]
		expect(() => tracker.track(tx, badCheck)).to.throw('rankCheck must be a boolean')
		// state untouched: still the default mode
		expect(() => tracker.admit(tx, 'takeOmega')).to.throw('belongs to the teardown order')
	})
})

describe('createLockOrderTracker: the spec', () => {
	it('is checked when the tracker is made', () => {
		expect(() => createLockOrderTracker({ ...TOY_SPEC, defaultMode: 'nope' } as never)).to.throw(TypeError, 'spec.defaultMode')
		expect(() => createLockOrderTracker(null as never)).to.throw(TypeError, 'spec must be an object')
	})

	it('is copied: a change to the object after the tracker was made changes nothing', () => {
		const spec = {
			orders: { standard: ['alpha', 'beta'] },
			helpers: { takeAlpha: { standard: 'alpha' }, takeBeta: { standard: 'beta' } },
			defaultMode: 'standard' as const
		}
		const tracker = createLockOrderTracker(spec)
		spec.orders.standard.reverse()
		spec.helpers.takeAlpha.standard = 'beta'
		const tx = {}
		tracker.record(tx, tracker.admit(tx, 'takeBeta'))
		expect(() => tracker.admit(tx, 'takeAlpha')).to.throw('takes rank 1 (alpha) after rank 2 (beta)')
	})

	it('throws a TypeError, not a mode error, for a helper the spec does not name', () => {
		const tracker = toyTracker()
		const helper = 'takeNothing' as unknown as Parameters<typeof tracker.admit>[1]
		expect(() => tracker.admit({}, helper)).to.throw(TypeError, 'helper is not named in the lock order spec')
	})
})
