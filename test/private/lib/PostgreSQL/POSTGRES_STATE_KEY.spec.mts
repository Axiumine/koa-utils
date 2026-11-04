import { POSTGRES_STATE_KEY } from '@private/lib/PostgreSQL/POSTGRES_STATE_KEY.mjs'
import { POSTGRES_STATE_LAYOUT } from '@private/lib/PostgreSQL/POSTGRES_STATE_LAYOUT.mjs'
import { expect } from 'chai'

describe('POSTGRES_STATE_KEY and POSTGRES_STATE_LAYOUT', () => {
	it('the key is the registry symbol of the package, so copies loaded from two places agree on it', () => {
		expect(POSTGRES_STATE_KEY).to.equal(Symbol.for('@axiumine/koa-utils/postgres-state'))
		expect(Symbol.keyFor(POSTGRES_STATE_KEY)).to.equal('@axiumine/koa-utils/postgres-state')
	})

	// golden: layout change = copies refuse each other → deliberate act, never by accident
	it('the layout is 1', () => {
		expect(POSTGRES_STATE_LAYOUT).to.equal(1)
	})
})
