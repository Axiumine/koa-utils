import { logGlobalError } from '../../../../dist/lib/db/log/logGlobalError.mjs'
import { expect } from 'chai'

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
})
