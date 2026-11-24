/**
 * Spec private/email/socketLabsResponse.mts
 *
 * Injection API answer → outcome. Mirror SDK SendResponse.parse. Only 200 read, rest unclassified.
 */
import { parseInjectionResponse } from '@private/email/socketLabsResponse.mjs'
import { expect } from 'chai'

// ErrorCode values the API can send. Hard-coded copy → typo in src list fail here
const API_CODES = [
	'Success',
	'Warning',
	'InternalError',
	'MessageTooLarge',
	'TooManyRecipients',
	'InvalidData',
	'OverQuota',
	'TooManyErrors',
	'InvalidAuthentication',
	'AccountDisabled',
	'TooManyMessages',
	'NoValidRecipients',
	'InvalidAddress',
	'InvalidAttachment',
	'NoMessages',
	'EmptyMessage',
	'EmptySubject',
	'InvalidFrom',
	'EmptyToAddress',
	'NoValidBodyParts',
	'InvalidTemplateId',
	'TemplateHasNoContent',
	'MessageBodyConflict',
	'InvalidMergeData',
	'MetadataOrTagsAreTooLarge'
]

const body = (value: unknown): string => JSON.stringify(value)
const ok200 = (value: unknown) => parseInjectionResponse(200, body(value))

describe('parseInjectionResponse', () => {
	describe('status', () => {
		// success body on purpose → only status can make these unclassified
		for (const status of [100, 199, 201, 202, 204, 299, 301, 302, 400, 401, 403, 404, 408, 429, 500, 502, 503, 504, 599]) {
			it(`${status} is not classified, whatever the body says`, () => {
				expect(parseInjectionResponse(status, body({ ErrorCode: 'Success', TransactionReceipt: 'r-1' }))).to.deep.equal({})
			})
		}
	})

	describe('200 body that is not JSON', () => {
		for (const text of ['', 'not json', '<html>502</html>', '{"ErrorCode":']) {
			it(`${JSON.stringify(text)} gives UnknownError`, () => {
				expect(parseInjectionResponse(200, text)).to.deep.equal({ name: 'UnknownError' })
			})
		}
	})

	describe('200 body that is JSON but not an object', () => {
		for (const text of ['null', '5', '"Success"', 'true']) {
			it(`${text} is not classified`, () => {
				expect(parseInjectionResponse(200, text)).to.deep.equal({})
			})
		}

		it('an array is not classified either', () => {
			expect(parseInjectionResponse(200, '[]')).to.deep.equal({})
			expect(parseInjectionResponse(200, '[{"ErrorCode":"Success"}]')).to.deep.equal({})
		})
	})

	describe('ErrorCode', () => {
		for (const code of API_CODES) {
			it(`${code} gives exactly { name: "${code}" }`, () => {
				expect(ok200({ ErrorCode: code })).to.deep.equal({ name: code })
			})
		}

		// not in the list → no name. Set lookup → prototype keys are no codes
		for (const bad of ['Bogus', 'success', 'SUCCESS', ' Success', 'Success ', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'Timeout', 'UnknownError', 5, null, true, {}, ['Success']]) {
			it(`${JSON.stringify(bad)} is not classified`, () => {
				expect(ok200({ ErrorCode: bad })).to.deep.equal({})
			})
		}

		it('a missing ErrorCode is not classified', () => {
			expect(ok200({})).to.deep.equal({})
		})
	})

	describe('Warning', () => {
		const warning = (messageResults: unknown) => ok200({ ErrorCode: 'Warning', MessageResults: messageResults })

		it('takes the ErrorCode of the first message result when it is a known one', () => {
			expect(warning([{ ErrorCode: 'InvalidAddress' }])).to.deep.equal({ name: 'InvalidAddress' })
		})

		it('a Success there wins too, as in the SDK', () => {
			expect(warning([{ ErrorCode: 'Success' }])).to.deep.equal({ name: 'Success' })
		})

		it('only the first message result counts', () => {
			expect(warning([{ ErrorCode: 'NoValidRecipients' }, { ErrorCode: 'InvalidAddress' }])).to.deep.equal({ name: 'NoValidRecipients' })
			expect(warning([{ ErrorCode: 'Bogus' }, { ErrorCode: 'InvalidAddress' }])).to.deep.equal({ name: 'Warning' })
		})

		for (const [label, results] of [
			['an unknown code', [{ ErrorCode: 'Bogus' }]],
			['no ErrorCode', [{ Index: 0 }]],
			['a non-string ErrorCode', [{ ErrorCode: 7 }]],
			['an empty list', []],
			['no list', undefined],
			['a list that is not an array', { ErrorCode: 'InvalidAddress' }],
			['a null first entry', [null]],
			['a string first entry', ['InvalidAddress']]
		] as const) {
			it(`stays Warning when the message results hold ${label}`, () => {
				expect(warning(results)).to.deep.equal({ name: 'Warning' })
			})
		}

		it('another top-level code is never replaced by a message result', () => {
			expect(ok200({ ErrorCode: 'OverQuota', MessageResults: [{ ErrorCode: 'InvalidAddress' }] })).to.deep.equal({ name: 'OverQuota' })
			expect(ok200({ ErrorCode: 'Success', MessageResults: [{ ErrorCode: 'InvalidAddress' }] })).to.deep.equal({ name: 'Success' })
		})
	})

	describe('transaction receipt', () => {
		it('a non-empty string is kept', () => {
			expect(ok200({ ErrorCode: 'InternalError', TransactionReceipt: 'receipt-42' })).to.deep.equal({
				name: 'InternalError',
				transactionReceipt: 'receipt-42'
			})
		})

		for (const bad of ['', null, 42, true, {}, ['r']]) {
			it(`${JSON.stringify(bad)} is dropped`, () => {
				expect(ok200({ ErrorCode: 'InternalError', TransactionReceipt: bad })).to.deep.equal({ name: 'InternalError' })
			})
		}

		it('is kept without a classified code too', () => {
			expect(ok200({ ErrorCode: 'Bogus', TransactionReceipt: 'r-9' })).to.deep.equal({ transactionReceipt: 'r-9' })
		})
	})

	describe('address results', () => {
		it('the objects of the first message result are kept as the server sent them', () => {
			const results = [
				{ EmailAddress: 'a@example.com', Accepted: false, ErrorCode: 'InvalidAddress' },
				{ EmailAddress: 'b@example.com', Accepted: true }
			]
			expect(ok200({ ErrorCode: 'Warning', MessageResults: [{ ErrorCode: 'InvalidAddress', AddressResults: results }] })).to.deep.equal({
				name: 'InvalidAddress',
				addressResults: results
			})
		})

		it('entries that are not objects are filtered out', () => {
			const outcome = ok200({ ErrorCode: 'Warning', MessageResults: [{ AddressResults: [null, 'x', 3, { EmailAddress: 'a@b.c' }, undefined] }] })
			expect(outcome).to.deep.equal({ name: 'Warning', addressResults: [{ EmailAddress: 'a@b.c' }] })
		})

		it('an empty list stays an empty list', () => {
			expect(ok200({ ErrorCode: 'Success', MessageResults: [{ AddressResults: [] }] })).to.deep.equal({ name: 'Success', addressResults: [] })
		})

		for (const bad of [null, 'x', 4, { EmailAddress: 'a@b.c' }]) {
			it(`${JSON.stringify(bad)} instead of a list is dropped`, () => {
				expect(ok200({ ErrorCode: 'Warning', MessageResults: [{ AddressResults: bad }] })).to.deep.equal({ name: 'Warning' })
			})
		}

		it('no message results: none', () => {
			expect(ok200({ ErrorCode: 'Success' })).to.deep.equal({ name: 'Success' })
			expect(ok200({ ErrorCode: 'Success', MessageResults: [] })).to.deep.equal({ name: 'Success' })
		})

		it('only the first message result is read', () => {
			const outcome = ok200({ ErrorCode: 'Success', MessageResults: [{}, { AddressResults: [{ EmailAddress: 'late@example.com' }] }] })
			expect(outcome).to.deep.equal({ name: 'Success' })
		})
	})

	it('a full realistic Warning answer', () => {
		const outcome = ok200({
			ErrorCode: 'Warning',
			TransactionReceipt: 'tx-1',
			MessageResults: [
				{ Index: 0, ErrorCode: 'InvalidAddress', AddressResults: [{ EmailAddress: 'bad', Accepted: false, ErrorCode: 'InvalidAddress' }] }
			]
		})
		expect(outcome).to.deep.equal({
			name: 'InvalidAddress',
			transactionReceipt: 'tx-1',
			addressResults: [{ EmailAddress: 'bad', Accepted: false, ErrorCode: 'InvalidAddress' }]
		})
	})
})
