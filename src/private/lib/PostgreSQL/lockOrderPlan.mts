import type { ILockOrderPlan } from './ILockOrderPlan.mjs'
import type { IModeOrder } from './IModeOrder.mjs'

/** The fields of a spec as an untyped caller may have given them. */
interface ILooseSpec {
	readonly orders?: unknown
	readonly helpers?: unknown
	readonly defaultMode?: unknown
}

/** True for a non-empty list of distinct, non-empty names. */
function isRankList(value: unknown): value is readonly string[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((name) => typeof name === 'string' && name !== '') &&
		new Set(value).size === value.length
	)
}

/** One empty order per mode of the spec. A `TypeError` for no mode, or a list of ranks that is not one. */
function modeOrders(orders: unknown): Map<string, IModeOrder> {
	if (typeof orders !== 'object' || orders === null) throw new TypeError('spec.orders must be an object')
	const entries = Object.entries(orders)
	if (entries.length === 0) throw new TypeError('spec.orders must name at least one mode')
	const byMode = new Map<string, IModeOrder>()
	for (const [mode, names] of entries) {
		if (!isRankList(names)) throw new TypeError(`the order of ${mode} must be a non-empty list of distinct names`)
		byMode.set(mode, { mode, names: [...names], ranks: new Map() })
	}
	return byMode
}

/** Puts one helper in the order of each mode it names; answers whether it named any. A `TypeError` for a mode or a rank the spec lacks. */
function placeHelper(helper: string, entry: unknown, byMode: ReadonlyMap<string, IModeOrder>): boolean {
	if (typeof entry !== 'object' || entry === null) throw new TypeError(`${helper} must map modes to rank names`)
	let placed = false
	for (const [mode, name] of Object.entries(entry)) {
		const order = byMode.get(mode)
		if (order === undefined) throw new TypeError(`${helper} names a mode that is not in spec.orders`)
		if (name === undefined) continue
		const rank = order.names.indexOf(name as string) + 1
		if (rank === 0) throw new TypeError(`${helper} names a rank that is not in the ${mode} order`)
		order.ranks.set(helper, { name: name as string, rank })
		placed = true
	}
	return placed
}

/**
 * Checks a lock-order spec and copies it into a plan. The checks that keep an order from being silently off: at least one
 * mode, each order a non-empty list of distinct names, the default mode one of the modes, every helper mapped to a rank
 * that exists in the order of a mode that exists, and every helper in at least one order. A `TypeError` names the part
 * that is wrong and never quotes a value other than the name of a mode or a helper.
 */
export function lockOrderPlan(spec: unknown): ILockOrderPlan {
	if (typeof spec !== 'object' || spec === null) throw new TypeError('spec must be an object')
	const { orders, helpers, defaultMode } = spec as ILooseSpec
	const byMode = modeOrders(orders)
	const defaultOrder = byMode.get(defaultMode as string)
	if (defaultOrder === undefined) throw new TypeError('spec.defaultMode must be one of the modes')
	if (typeof helpers !== 'object' || helpers === null) throw new TypeError('spec.helpers must be an object')
	const names = new Set<string>()
	for (const [helper, entry] of Object.entries(helpers)) {
		if (!placeHelper(helper, entry, byMode)) throw new TypeError(`${helper} takes no rank in any mode`)
		names.add(helper)
	}
	return { defaultOrder, orders: byMode, helpers: names }
}
