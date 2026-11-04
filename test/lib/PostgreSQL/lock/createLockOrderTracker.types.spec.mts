import { createLockOrderTracker } from '@lib/PostgreSQL/lock/createLockOrderTracker.mjs'
import { expect } from 'chai'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fn holding them never called. Names of modes + helpers taken from the spec → typo caught at compile time

// compiled, never run
function typedNames(): void {
	const tracker = createLockOrderTracker({
		orders: { standard: ['alpha', 'beta'], teardown: ['beta'] },
		helpers: { takeAlpha: { standard: 'alpha' }, takeBeta: { standard: 'beta', teardown: 'beta' } },
		defaultMode: 'standard'
	})
	const tx = {}
	void tracker.admit(tx, 'takeAlpha')
	tracker.track(tx, { mode: 'teardown' })
	// @ts-expect-error -- helper not in spec
	void tracker.admit(tx, 'takeGamma')
	// @ts-expect-error -- mode not in spec
	tracker.track(tx, { mode: 'exclusive' })
	void createLockOrderTracker({
		orders: { standard: ['alpha'] },
		// @ts-expect-error -- a mode in a helper entry must be a mode of orders
		helpers: { takeAlpha: { standrad: 'alpha' } },
		defaultMode: 'standard'
	})
	void createLockOrderTracker({
		orders: { standard: ['alpha'] },
		helpers: { takeAlpha: { standard: 'alpha' } },
		// @ts-expect-error -- default mode must be a mode of orders
		defaultMode: 'other'
	})
	// @ts-expect-error -- rankCheck is a boolean
	tracker.configure({ rankCheck: 'yes' })
	// @ts-expect-error -- strength is a number
	tracker.hold(tx, 'row', 'strong')
	// wrapper may pass an explicit undefined
	const maybe: boolean | undefined = undefined
	tracker.configure({ rankCheck: maybe })
	tracker.track(tx, { mode: undefined, rankCheck: maybe })
}

describe('createLockOrderTracker: types', () => {
	it('holds its type claims in the compiled-only function above', () => {
		expect(typeof typedNames).to.equal('function')
	})
})
