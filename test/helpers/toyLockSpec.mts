import { createLockOrderTracker } from '@lib/PostgreSQL/lock/createLockOrderTracker.mjs'
import type { ILockOrderSpec } from '@lib/PostgreSQL/lock/ILockOrderSpec.mjs'
import type { ILockOrderTracker } from '@lib/PostgreSQL/lock/ILockOrderTracker.mjs'

// toy spec, neutral names. standard: 6 ranks, teardown: 3 ranks. takeBeta + takeGamma in both orders,
// takeOmega teardown only, takeAlpha/Delta/Epsilon/Zeta standard only
export const TOY_SPEC = {
	orders: {
		standard: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'],
		teardown: ['beta', 'gamma', 'omega']
	},
	helpers: {
		takeAlpha: { standard: 'alpha' },
		takeBeta: { standard: 'beta', teardown: 'beta' },
		takeGamma: { standard: 'gamma', teardown: 'gamma' },
		takeDelta: { standard: 'delta' },
		takeEpsilon: { standard: 'epsilon', teardown: undefined },
		takeZeta: { standard: 'zeta' },
		takeOmega: { teardown: 'omega' }
	},
	defaultMode: 'standard'
} as const satisfies ILockOrderSpec

export type TToyMode = keyof typeof TOY_SPEC.orders
export type TToyHelper = keyof typeof TOY_SPEC.helpers

// helpers of the standard order with their rank (1-based), lowest first
export const STANDARD_HELPERS: readonly { helper: TToyHelper; rank: number; name: string }[] = [
	{ helper: 'takeAlpha', rank: 1, name: 'alpha' },
	{ helper: 'takeBeta', rank: 2, name: 'beta' },
	{ helper: 'takeGamma', rank: 3, name: 'gamma' },
	{ helper: 'takeDelta', rank: 4, name: 'delta' },
	{ helper: 'takeEpsilon', rank: 5, name: 'epsilon' },
	{ helper: 'takeZeta', rank: 6, name: 'zeta' }
]

export function toyTracker(): ILockOrderTracker<TToyMode, TToyHelper> {
	return createLockOrderTracker<TToyMode, TToyHelper>(TOY_SPEC)
}
