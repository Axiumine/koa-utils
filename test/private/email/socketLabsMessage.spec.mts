/**
 * Spec private/email/socketLabsMessage.mts
 *
 * ISocketLabsMessage → BasicMessage-shaped object. Absent value → key absent. Non-string → TypeError naming field.
 */
import type { ISocketLabsMessage } from '@email/ISocketLabsMessage.mjs'
import { buildBasicMessage } from '@private/email/socketLabsMessage.mjs'
import { expect } from 'chai'

const MESSAGE: ISocketLabsMessage = {
	from: 'from@example.com',
	fromName: 'From Name',
	to: 'to@example.com',
	subject: 'Subject line',
	text: 'Text body',
	html: '<p>Html body</p>',
	messageId: 'msg-1'
}

// field → label in error text, same order as the builder reads them
const FIELDS: [keyof ISocketLabsMessage, string][] = [
	['from', 'from address'],
	['fromName', 'from name'],
	['subject', 'subject'],
	['text', 'text body'],
	['html', 'html body'],
	['to', 'to address'],
	['messageId', 'message id']
]

const without = (field: keyof ISocketLabsMessage): ISocketLabsMessage => {
	const copy: Partial<ISocketLabsMessage> = { ...MESSAGE }
	delete copy[field]
	return copy as ISocketLabsMessage
}

const errorOf = (message: ISocketLabsMessage): unknown => {
	try {
		buildBasicMessage(message)
	} catch (err: unknown) {
		return err
	}
	return undefined
}

describe('buildBasicMessage', () => {
	it('maps every field onto the BasicMessage shape', () => {
		expect(buildBasicMessage(MESSAGE)).to.deep.equal({
			messageType: 'basic',
			from: { emailAddress: 'from@example.com', friendlyName: 'From Name' },
			to: [{ emailAddress: 'to@example.com' }],
			subject: 'Subject line',
			textBody: 'Text body',
			htmlBody: '<p>Html body</p>',
			messageId: 'msg-1'
		})
	})

	it('sends the html as given: no wrapper, no escaping', () => {
		const html = '<!DOCTYPE html><title>t</title> & <b>"x"</b>'
		expect(buildBasicMessage({ ...MESSAGE, html }).htmlBody).to.equal(html)
	})

	it('builds a fresh object per call, nothing shared', () => {
		const first = buildBasicMessage(MESSAGE)
		const second = buildBasicMessage(MESSAGE)
		expect(first).to.not.equal(second)
		expect(first.to).to.not.equal(second.to)
		expect(first.from).to.not.equal(second.from)
	})

	for (const [field, key] of [
		['text', 'textBody'],
		['html', 'htmlBody'],
		['messageId', 'messageId']
	] as const) {
		it(`${field} omitted: no ${key} key at all`, () => {
			expect(buildBasicMessage(without(field))).to.not.have.property(key)
		})

		for (const [label, absent] of [
			['undefined', undefined],
			['null', null],
			['an empty string', ''],
			['0', 0],
			['false', false]
		] as const) {
			// cast → feed absent junk on purpose, SDK setters skipped every falsy value
			it(`${field} as ${label}: no ${key} key, no throw`, () => {
				expect(buildBasicMessage({ ...MESSAGE, [field]: absent as never })).to.not.have.property(key)
			})
		}
	}

	it('fromName omitted: from carries the address only', () => {
		const { from } = buildBasicMessage(without('fromName'))
		expect(from).to.deep.equal({ emailAddress: 'from@example.com' })
		expect(from).to.not.have.property('friendlyName')
	})

	it('fromName as undefined or an empty string: no friendlyName key', () => {
		expect(buildBasicMessage({ ...MESSAGE, fromName: undefined }).from).to.not.have.property('friendlyName')
		expect(buildBasicMessage({ ...MESSAGE, fromName: '' }).from).to.not.have.property('friendlyName')
	})

	it('an empty from gives an empty address object, left for the validator to refuse', () => {
		expect(buildBasicMessage({ ...MESSAGE, from: '' }).from).to.deep.equal({ friendlyName: 'From Name' })
	})

	it('an empty or missing subject: no subject key', () => {
		expect(buildBasicMessage({ ...MESSAGE, subject: '' })).to.not.have.property('subject')
		expect(buildBasicMessage(without('subject'))).to.not.have.property('subject')
	})

	it('an empty or missing to: empty recipient list', () => {
		expect(buildBasicMessage({ ...MESSAGE, to: '' }).to).to.deep.equal([])
		expect(buildBasicMessage(without('to')).to).to.deep.equal([])
	})

	it('sets messageType basic and nothing the SDK left unset', () => {
		const built = buildBasicMessage({ from: 'a@b.c', to: 'd@e.f', subject: 's' })
		expect(built).to.deep.equal({
			messageType: 'basic',
			from: { emailAddress: 'a@b.c' },
			to: [{ emailAddress: 'd@e.f' }],
			subject: 's'
		})
	})

	describe('a field that is set but not a string', () => {
		for (const [field, label] of FIELDS) {
			it(`${field} throws a TypeError naming "${label}", never the value`, () => {
				// cast → feed a number on purpose
				const err = errorOf({ ...MESSAGE, [field]: 987654 as never })
				expect(err).to.be.instanceOf(TypeError)
				expect((err as TypeError).message).to.equal(`Invalid ${label}, type of 'string' was expected.`)
				expect((err as TypeError).message).to.not.contain('987654')
			})
		}

		for (const bad of [{}, [], ['a@b.c'], true, 1n, Symbol.iterator, () => 'x']) {
			it(`subject ${typeof bad} throws`, () => {
				expect(errorOf({ ...MESSAGE, subject: bad as never })).to.be.instanceOf(TypeError)
			})
		}

		// first bad field in read order wins → pair (field, next field) both bad
		for (let i = 0; i < FIELDS.length - 1; i++) {
			const [first, firstLabel] = FIELDS[i] as [keyof ISocketLabsMessage, string]
			const [second] = FIELDS[i + 1] as [keyof ISocketLabsMessage, string]
			it(`${first} is reported before ${second} when both are wrong`, () => {
				const err = errorOf({ ...MESSAGE, [first]: 1 as never, [second]: 2 as never })
				expect((err as TypeError).message).to.equal(`Invalid ${firstLabel}, type of 'string' was expected.`)
			})
		}
	})
})
