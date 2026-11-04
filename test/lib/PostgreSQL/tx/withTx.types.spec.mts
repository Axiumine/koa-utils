import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import type { IPoolCounterName } from '@lib/PostgreSQL/pool/IPoolCounterName.mjs'
import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import type { ITxClient } from '@lib/PostgreSQL/tx/ITxClient.mjs'
import type { ITxCounterName } from '@lib/PostgreSQL/tx/ITxCounterName.mjs'
import type { ITxOptions } from '@lib/PostgreSQL/tx/ITxOptions.mjs'
import type { ITxPool } from '@lib/PostgreSQL/tx/ITxPool.mjs'
import { withTx } from '@lib/PostgreSQL/tx/withTx.mjs'
import { expect } from 'chai'
import pg from 'pg'

import { type AppError, appErrors } from '../../../helpers/appErrors.mjs'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fn holding them never called. build:tests is noCheck → only that gate prove it. Runtime half of proof
// (1 own key, frozen, closed handle) → withTx.handle.spec.mts

// compiled, never run. handle = query only
function handleHasQueryOnly(tx: ITx, pool: pg.Pool, logger: IPoolLogger): void {
	// @ts-expect-error -- no connect
	void tx.connect
	// @ts-expect-error -- no release
	void tx.release
	// @ts-expect-error -- no end
	void tx.end
	// @ts-expect-error -- no pool
	void tx.pool
	// @ts-expect-error -- no client
	void tx.client
	// @ts-expect-error -- no event methods
	void tx.on
	// @ts-expect-error -- handle is not a pool → cannot pass where one wanted
	const asPool: pg.Pool = tx
	void asPool
	// @ts-expect-error -- pool is not a handle: nothing but query is a handle
	const fromObject: ITx = {}
	void fromObject
	// @ts-expect-error -- fn receives ITx → callback asking for pool does not fit
	void withTx(pool, { logger, errors: appErrors }, (arg: pg.Pool) => Promise.resolve(arg))
}

// compiled, never run. answer typed by row type caller names
async function rowsAreTyped(tx: ITx): Promise<number> {
	const result = await tx.query<{ n: number }>('SELECT 1 AS n')
	// @ts-expect-error -- row has n and no m
	void result.rows[0]?.m
	return result.rows[0]?.n ?? 0
}

// compiled, never run. options: errors required, only internal read, counter may be wider, never narrower
function optionsAreChecked(logger: IPoolLogger, pool: ITxPool): void {
	const onlyInternal: ITxOptions = { logger, errors: { internal: (reason) => new Error(reason) } }
	const factory: IDbErrorFactory<AppError> = appErrors
	const full: ITxOptions = { logger, errors: factory }
	const wide: (name: ITxCounterName | IPoolCounterName) => void = () => undefined
	const withWideCounter: ITxOptions = { logger, errors: factory, counter: wide }
	void [onlyInternal, full, withWideCounter]
	// @ts-expect-error -- errors is required: withTx cannot build its error without it
	void withTx(pool, { logger }, () => Promise.resolve())
	// @ts-expect-error -- errors without internal
	void withTx(pool, { logger, errors: { make: factory.make } }, () => Promise.resolve())
	// @ts-expect-error -- counter that takes one name only is called with others
	const narrow: ITxOptions = { logger, errors: factory, counter: (name: 'db_tx_retries_total') => void name }
	void narrow
	// @ts-expect-error -- READ UNCOMMITTED is not offered
	const level: ITxOptions = { logger, errors: factory, isolation: 'READ UNCOMMITTED' }
	void level
}

describe('withTx: the types', () => {
	it('are checked by the compiler (yarn typecheck:tests): the handle has a query method and nothing else', () => {
		expect(typeof handleHasQueryOnly).to.equal('function')
		expect(typeof rowsAreTyped).to.equal('function')
		expect(typeof optionsAreChecked).to.equal('function')
	})

	it('accept the real pool and the real client of the driver', async () => {
		const pool = new pg.Pool()
		const asTxPool: ITxPool = pool
		const asTxClient: ITxClient = {} as pg.PoolClient
		expect(asTxPool).to.equal(pool)
		expect(asTxClient).to.deep.equal({})
		await pool.end()
	})
})
