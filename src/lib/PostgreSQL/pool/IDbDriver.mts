import type { IDriverTypes } from '@lib/PostgreSQL/parse/IDriverTypes.mjs'
import type { IPoolEvents } from '@lib/PostgreSQL/pool/IPoolEvents.mjs'

/**
 * The driver module, `import pg from 'pg'`: the node-postgres module is a parameter of `createPool`, never an import.
 * The members are typed loosely on purpose: the factory calls them through narrow shapes of its own, and a test against
 * the real module is the check that the shapes are right.
 */
export interface IDbDriver<TPool extends IPoolEvents = IPoolEvents> {
	readonly Client: new (config: never) => unknown
	readonly Pool: new (config: never) => TPool
	readonly types: IDriverTypes
}
