import { createDbClock } from '@lib/PostgreSQL/clock/createDbClock.mjs'
import type { IClock } from '@lib/PostgreSQL/clock/IClock.mjs'
import type { IDbClock } from '@lib/PostgreSQL/clock/IDbClock.mjs'
import type { IDbClockOptions } from '@lib/PostgreSQL/clock/IDbClockOptions.mjs'
import type { ITx } from '@lib/PostgreSQL/tx/ITx.mjs'
import { expect } from 'chai'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fn holding them never called

// compiled, never run
function optionsAndPort(tx: ITx): void {
	// @ts-expect-error -- write compulsory: choice made where tx opens
	const missingWrite: IDbClockOptions = {}
	void missingWrite
	// @ts-expect-error -- write is a boolean
	void createDbClock(tx, { write: 'yes' })
	// @ts-expect-error -- seam needs both statement and allowed
	void createDbClock(tx, { write: false, seam: { statement: 'SELECT 1' } })
	// @ts-expect-error -- allowed is a boolean, no truthy stand-in
	void createDbClock(tx, { write: false, seam: { statement: 'SELECT 1', allowed: 1 } })
	// wrapper may pass an explicit undefined seam
	const maybeSeam: IDbClockOptions['seam'] = undefined
	void createDbClock(tx, { write: false, seam: maybeSeam })
	const clock: IDbClock = createDbClock(tx, { write: false })
	// db clock fits plain port
	const port: IClock = clock
	// plain port has no read
	// @ts-expect-error -- port has now only
	void port.read
	// @ts-expect-error -- a plain object is no handle: query missing
	void createDbClock({}, { write: false })
}

describe('createDbClock: types', () => {
	it('holds its type claims in the compiled-only function above', () => {
		expect(typeof optionsAndPort).to.equal('function')
	})
})
