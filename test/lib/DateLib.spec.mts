import { DateLib } from '@lib/DateLib.mjs'
import { expect } from 'chai'

describe('DateLib', () => {
	it('can be instantiated with new (covers constructor line)', () => {
		const instance = new DateLib()
		expect(instance).to.be.instanceOf(DateLib)
	})

	describe('getDate', () => {
		it('parses YYYYMMDDHHmmss formatted number into UTC date + year', () => {
			const out = DateLib.getDate(20240315123045 as unknown as Date)
			expect(out.year).to.equal(2024)
			expect(out.date.toISOString()).to.equal('2024-03-15T12:30:45.000Z')
		})
	})

	describe('timeDiffMin', () => {
		it('returns 0 when delta < 1 min', () => {
			expect(DateLib.timeDiffMin(1000, 2000)).to.equal(0)
		})
		it('returns minutes for delta >= 60s', () => {
			expect(DateLib.timeDiffMin(0, 60 * 1000)).to.equal(1)
			expect(DateLib.timeDiffMin(0, 5 * 60 * 1000)).to.equal(5)
		})
		it('returns absolute diff (lastReq > now)', () => {
			expect(DateLib.timeDiffMin(120 * 1000, 0)).to.equal(2)
		})
	})

	describe('minElapsed', () => {
		it('returns minutes elapsed from given date until now', () => {
			const past = new Date(Date.now() - 3 * 60 * 1000)
			const out = DateLib.minElapsed(past)
			expect(out).to.be.at.least(3)
			expect(out).to.be.at.most(4)
		})
	})
})
