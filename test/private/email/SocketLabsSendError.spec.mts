/**
 * Spec private/email/SocketLabsSendError.mts
 *
 * Rejection of built-in client. Error + SDK SendResponse fields. Text = result name only.
 */
import { SocketLabsSendError } from '@private/email/SocketLabsSendError.mjs'
import { expect } from 'chai'

describe('SocketLabsSendError', () => {
	it('is an Error with the class name', () => {
		const err = new SocketLabsSendError({ name: 'Timeout' })
		expect(err).to.be.instanceOf(Error)
		expect(err).to.be.instanceOf(SocketLabsSendError)
		expect(err.name).to.equal('SocketLabsSendError')
		expect(err.stack).to.be.a('string')
	})

	it('puts the result name in result and in the text', () => {
		const err = new SocketLabsSendError({ name: 'OverQuota' })
		expect(err.result).to.deep.equal({ name: 'OverQuota' })
		expect(err.message).to.equal('SocketLabs send failed: OverQuota')
	})

	it('no name: no result key, text says UnknownError', () => {
		const err = new SocketLabsSendError({})
		expect(err).to.not.have.property('result')
		expect(err.result).to.equal(undefined)
		expect(err.message).to.equal('SocketLabs send failed: UnknownError')
	})

	it('receipt and address results default to null', () => {
		const err = new SocketLabsSendError({ name: 'Timeout' })
		expect(err.transactionReceipt).to.equal(null)
		expect(err.addressResults).to.equal(null)
	})

	it('receipt and address results are carried, the text holds neither', () => {
		const addressResults = [{ EmailAddress: 'planted.recipient@example.org' }]
		const err = new SocketLabsSendError({ name: 'Warning', transactionReceipt: 'planted-receipt', addressResults })
		expect(err.transactionReceipt).to.equal('planted-receipt')
		expect(err.addressResults).to.equal(addressResults)
		expect(err.message).to.equal('SocketLabs send failed: Warning')
		expect(err.stack).to.not.contain('planted-receipt')
		expect(err.stack).to.not.contain('planted.recipient')
	})

	it('an empty-string name is a name, not an absence', () => {
		const err = new SocketLabsSendError({ name: '' })
		expect(err.result).to.deep.equal({ name: '' })
		expect(err.message).to.equal('SocketLabs send failed: ')
	})
})
