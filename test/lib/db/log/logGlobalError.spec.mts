import { logGlobalError } from '../../../../dist/lib/db/log/logGlobalError.mjs'
import { expect } from 'chai'
import mongoose from 'mongoose'
import sinon from 'sinon'

describe('logGlobalError', () => {
	it('returns undefined early when message is empty and stackArr is empty', () => {
		const result = logGlobalError({ message: '', stackArr: [] })
		expect(result).to.be.undefined
	})

	it('does not throw when message is provided and stackArr is empty', () => {
		expect(() => logGlobalError({ message: 'some error', stackArr: [] })).to.not.throw()
	})

	it('does not throw when message is empty and stackArr has entries', () => {
		expect(() => logGlobalError({ message: '', stackArr: ['at foo (file.ts:1)'] })).to.not.throw()
	})

	it('does not throw when both message and stackArr are provided', () => {
		expect(() =>
			logGlobalError({ message: 'crash', stackArr: ['at bar (file.ts:2)', 'at baz (file.ts:3)'] })
		).to.not.throw()
	})

	// Doc never saved, never returned → only trace = Document.$set calls: ctor (obj arg), then setters m / s.
	describe('document built', () => {
		let setSpy: sinon.SinonSpy

		beforeEach(() => {
			setSpy = sinon.spy(mongoose.Document.prototype, '$set')
		})

		afterEach(() => {
			sinon.restore()
		})

		const callsOf = () => setSpy.getCalls().map((c) => c.args.slice(0, 2))

		it('builds no document when message empty and stackArr empty', () => {
			logGlobalError({ message: '', stackArr: [] })
			expect(setSpy.callCount).to.equal(0)
		})

		it('builds a document and sets only m when stackArr empty', () => {
			logGlobalError({ message: 'some error', stackArr: [] })
			expect(callsOf()).to.deep.equal([[{}, undefined], ['m', 'some error']])
		})

		it('builds a document and sets only s when message empty', () => {
			logGlobalError({ message: '', stackArr: ['at foo (file.ts:1)'] })
			expect(callsOf()).to.deep.equal([[{}, undefined], ['s', ['at foo (file.ts:1)']]])
		})

		it('sets both m and s when both given', () => {
			logGlobalError({ message: 'crash', stackArr: ['a', 'b'] })
			expect(callsOf()).to.deep.equal([[{}, undefined], ['m', 'crash'], ['s', ['a', 'b']]])
		})
	})
})
