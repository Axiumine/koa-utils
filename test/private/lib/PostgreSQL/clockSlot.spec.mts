import { clockSlot } from '@private/lib/PostgreSQL/clockSlot.mjs'
import { postgresState } from '@private/lib/PostgreSQL/postgresState.mjs'
import { expect } from 'chai'

describe('clockSlot', () => {
	it('makes an empty slot for a handle it has not seen', () => {
		const slot = clockSlot({})
		expect(slot).to.deep.equal({ locked: false, instant: undefined, pending: undefined, read: undefined })
	})

	it('answers the same slot for the same handle, so a change is seen by the next caller', () => {
		const handle = {}
		const slot = clockSlot(handle)
		slot.locked = true
		slot.instant = 5
		expect(clockSlot(handle)).to.equal(slot)
		expect(clockSlot(handle).locked).to.equal(true)
		expect(clockSlot(handle).instant).to.equal(5)
	})

	it('keeps one slot per handle', () => {
		const a = clockSlot({})
		const b = clockSlot({})
		expect(a).to.not.equal(b)
		a.locked = true
		expect(b.locked).to.equal(false)
	})

	it('keeps the slot in the shared registry, keyed by the handle', () => {
		const handle = {}
		expect(postgresState.slots.has(handle)).to.equal(false)
		const slot = clockSlot(handle)
		expect(postgresState.slots.get(handle)).to.equal(slot)
	})
})
