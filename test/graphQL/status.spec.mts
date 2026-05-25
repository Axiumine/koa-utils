import {
	stOk,
	stExist,
	stFailToSendEmail,
	stNotFoundNotMatch,
	stErrBackend,
	stWait,
	stExpired
} from '../../dist/graphQL/status.mjs'
import { expect } from 'chai'

describe('graphQL/status', () => {
	it('stOk === "ok"', () => {
		expect(stOk).to.equal('ok')
	})

	it('stExist === "exist"', () => {
		expect(stExist).to.equal('exist')
	})

	it('stFailToSendEmail === "failToSendEmail"', () => {
		expect(stFailToSendEmail).to.equal('failToSendEmail')
	})

	it('stNotFoundNotMatch === "notFoundNotMatch"', () => {
		expect(stNotFoundNotMatch).to.equal('notFoundNotMatch')
	})

	it('stErrBackend === "errBackend"', () => {
		expect(stErrBackend).to.equal('errBackend')
	})

	it('stWait === "wait"', () => {
		expect(stWait).to.equal('wait')
	})

	it('stExpired === "expired"', () => {
		expect(stExpired).to.equal('expired')
	})

	it('all status constants are unique strings', () => {
		const values = [stOk, stExist, stFailToSendEmail, stNotFoundNotMatch, stErrBackend, stWait, stExpired]
		const unique = new Set(values)
		expect(unique.size).to.equal(values.length)
	})
})
