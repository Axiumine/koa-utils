import type { IHelperRank } from './IHelperRank.mjs'

/** The order of one mode, after the spec was checked: the ranks lowest first, and the rank each helper takes in it. */
export interface IModeOrder {
	readonly mode: string
	readonly names: readonly string[]
	readonly ranks: Map<string, IHelperRank>
}
