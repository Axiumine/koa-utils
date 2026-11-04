import { lockOrderPlan } from '@private/lib/PostgreSQL/lockOrderPlan.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'
import { TOY_SPEC } from '../../../helpers/toyLockSpec.mjs'

// spec as untyped caller gives it: fresh object each time, patched where the case needs
function spec(patch: Record<string, unknown> = {}): unknown {
	return {
		orders: { standard: ['alpha', 'beta'], teardown: ['beta'] },
		helpers: { takeAlpha: { standard: 'alpha' }, takeBeta: { standard: 'beta', teardown: 'beta' } },
		defaultMode: 'standard',
		...patch
	}
}

function messageOf(value: unknown): string {
	const error = thrownBy(() => lockOrderPlan(value))
	expect(error).to.be.instanceOf(TypeError)
	return (error as TypeError).message
}

describe('lockOrderPlan: the plan', () => {
	it('reads the toy spec into one order per mode, the default order and the helpers', () => {
		const plan = lockOrderPlan(TOY_SPEC)
		expect([...plan.orders.keys()]).to.deep.equal(['standard', 'teardown'])
		expect(plan.defaultOrder).to.equal(plan.orders.get('standard'))
		expect(plan.defaultOrder.mode).to.equal('standard')
		expect(plan.defaultOrder.names).to.deep.equal(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'])
		expect([...plan.helpers]).to.deep.equal([
			'takeAlpha',
			'takeBeta',
			'takeGamma',
			'takeDelta',
			'takeEpsilon',
			'takeZeta',
			'takeOmega'
		])
	})

	it('numbers the ranks from 1 by position, per mode', () => {
		const plan = lockOrderPlan(TOY_SPEC)
		const standard = plan.orders.get('standard')
		const teardown = plan.orders.get('teardown')
		expect(standard?.ranks.get('takeBeta')).to.deep.equal({ name: 'beta', rank: 2 })
		expect(standard?.ranks.get('takeZeta')).to.deep.equal({ name: 'zeta', rank: 6 })
		expect(teardown?.ranks.get('takeBeta')).to.deep.equal({ name: 'beta', rank: 1 })
		expect(teardown?.ranks.get('takeOmega')).to.deep.equal({ name: 'omega', rank: 3 })
	})

	it('leaves a helper out of the orders it does not name, or names as undefined', () => {
		const plan = lockOrderPlan(TOY_SPEC)
		expect(plan.orders.get('teardown')?.ranks.has('takeAlpha')).to.equal(false)
		expect(plan.orders.get('teardown')?.ranks.has('takeEpsilon')).to.equal(false)
		expect(plan.orders.get('standard')?.ranks.has('takeOmega')).to.equal(false)
	})

	it('copies the spec: a change to the caller object afterwards changes nothing', () => {
		const names = ['alpha', 'beta']
		const original = { orders: { standard: names }, helpers: { takeAlpha: { standard: 'alpha' } }, defaultMode: 'standard' }
		const plan = lockOrderPlan(original)
		names.push('gamma')
		original.helpers.takeAlpha.standard = 'beta'
		expect(plan.defaultOrder.names).to.deep.equal(['alpha', 'beta'])
		expect(plan.defaultOrder.ranks.get('takeAlpha')).to.deep.equal({ name: 'alpha', rank: 1 })
	})

	it('accepts a spec without helpers', () => {
		const plan = lockOrderPlan(spec({ helpers: {} }))
		expect(plan.helpers.size).to.equal(0)
	})

	it('names a mode like an object property without trouble', () => {
		const plan = lockOrderPlan(
			spec({
				orders: { toString: ['alpha'], constructor: ['beta'] },
				helpers: { h: { toString: 'alpha' } },
				defaultMode: 'constructor'
			})
		)
		expect(plan.defaultOrder.mode).to.equal('constructor')
		expect(plan.orders.get('toString')?.ranks.get('h')).to.deep.equal({ name: 'alpha', rank: 1 })
	})
})

describe('lockOrderPlan: a spec that would leave the order silently off', () => {
	it('refuses what is not an object', () => {
		for (const value of [undefined, null, 'spec', 1]) expect(messageOf(value)).to.equal('spec must be an object')
	})

	it('refuses orders that are missing, not an object or empty', () => {
		for (const orders of [undefined, null, 'standard', 3])
			expect(messageOf(spec({ orders }))).to.equal('spec.orders must be an object')
		expect(messageOf(spec({ orders: {} }))).to.equal('spec.orders must name at least one mode')
	})

	it('refuses an order that is not a non-empty list of distinct names, and names the mode', () => {
		const message = 'the order of standard must be a non-empty list of distinct names'
		for (const names of [undefined, 'alpha', {}, [], ['alpha', 'alpha'], ['alpha', ''], ['alpha', 2], [null]]) {
			expect(messageOf(spec({ orders: { standard: names } })), JSON.stringify(names)).to.equal(message)
		}
	})

	it('refuses a default mode that is not a mode', () => {
		for (const defaultMode of [undefined, 'other', 1, null, '__proto__']) {
			expect(messageOf(spec({ defaultMode }))).to.equal('spec.defaultMode must be one of the modes')
		}
	})

	it('refuses helpers that are missing or not an object', () => {
		for (const helpers of [undefined, null, 'takeAlpha', 1])
			expect(messageOf(spec({ helpers }))).to.equal('spec.helpers must be an object')
	})

	it('refuses a helper whose entry is not an object, and names the helper', () => {
		for (const entry of [undefined, null, 'alpha', 2]) {
			expect(messageOf(spec({ helpers: { takeAlpha: entry } }))).to.equal('takeAlpha must map modes to rank names')
		}
	})

	it('refuses a helper that names a mode the spec lacks (a typo in a mode)', () => {
		expect(messageOf(spec({ helpers: { takeAlpha: { standrad: 'alpha' } } }))).to.equal(
			'takeAlpha names a mode that is not in spec.orders'
		)
	})

	it('refuses a helper that names a rank its order lacks (a typo in a rank), and names the mode', () => {
		expect(messageOf(spec({ helpers: { takeAlpha: { standard: 'alpah' } } }))).to.equal(
			'takeAlpha names a rank that is not in the standard order'
		)
		expect(messageOf(spec({ helpers: { takeAlpha: { standard: 'alpha', teardown: 'alpha' } } }))).to.equal(
			'takeAlpha names a rank that is not in the teardown order'
		)
		expect(messageOf(spec({ helpers: { takeAlpha: { standard: 5 } } }))).to.equal(
			'takeAlpha names a rank that is not in the standard order'
		)
	})

	it('refuses a helper that takes no rank in any mode', () => {
		expect(messageOf(spec({ helpers: { takeNothing: {} } }))).to.equal('takeNothing takes no rank in any mode')
		expect(messageOf(spec({ helpers: { takeNothing: { standard: undefined } } }))).to.equal(
			'takeNothing takes no rank in any mode'
		)
	})

	it('quotes only the names of a mode or a helper, never another value', () => {
		const secret = 'planted-secret-value-1234'
		const messages = [
			messageOf(spec({ orders: { standard: [secret, secret] } })),
			messageOf(spec({ defaultMode: secret })),
			messageOf(spec({ helpers: { takeAlpha: { standard: secret } } }))
		]
		for (const message of messages) expect(message).to.not.contain(secret)
	})
})
