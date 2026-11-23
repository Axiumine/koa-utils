/**
 * Spec private/email/socketLabsRequest.mts
 *
 * credentials + message validation (SDK SendValidator order) + request headers / body (SDK createRequest).
 */
import type { ISocketLabsBasicMessage } from '@private/email/ISocketLabsBasicMessage.mjs'
import { buildInjectionRequest, credentialsOutcome, messageOutcome } from '@private/email/socketLabsRequest.mjs'
import { expect } from 'chai'

const MESSAGE: ISocketLabsBasicMessage = {
	messageType: 'basic',
	from: { emailAddress: 'from@example.com', friendlyName: 'From Name' },
	to: [{ emailAddress: 'to@example.com' }],
	subject: 'Subject line',
	textBody: 'Text body',
	htmlBody: '<p>Html body</p>',
	messageId: 'msg-1'
}

// fake keys only. 20 + '.' + 40 = 61 chars, SDK bearer form
const BEARER_KEY = `${'A'.repeat(20)}.${'b'.repeat(40)}`
const withMessage = (change: Partial<ISocketLabsBasicMessage>): ISocketLabsBasicMessage => ({ ...MESSAGE, ...change })
const withoutKey = (key: keyof ISocketLabsBasicMessage): ISocketLabsBasicMessage => {
	const copy: Partial<ISocketLabsBasicMessage> = { ...MESSAGE }
	delete copy[key]
	return copy as ISocketLabsBasicMessage
}

describe('credentialsOutcome', () => {
	it('a positive integer serverId and a non-empty string key pass', () => {
		expect(credentialsOutcome(1, 'k')).to.equal(undefined)
		expect(credentialsOutcome(4321, BEARER_KEY)).to.equal(undefined)
	})

	// cast-free: params are unknown
	for (const serverId of [0, -1, 1.5, NaN, Infinity, -Infinity, '1', '', null, undefined, {}, [1], true, 1n]) {
		it(`serverId ${String(serverId)} (${typeof serverId}) gives AuthenticationValidationFailed`, () => {
			expect(credentialsOutcome(serverId, 'key')).to.deep.equal({ name: 'AuthenticationValidationFailed' })
		})
	}

	for (const apiKey of ['', undefined, null, 5, {}, ['k'], true, Symbol.iterator]) {
		it(`apiKey ${typeof apiKey === 'symbol' ? 'a symbol' : JSON.stringify(apiKey)} gives AuthenticationValidationFailed`, () => {
			expect(credentialsOutcome(1, apiKey)).to.deep.equal({ name: 'AuthenticationValidationFailed' })
		})
	}

	it('a whitespace-only key still counts as a string, the server refuses it', () => {
		expect(credentialsOutcome(1, ' ')).to.equal(undefined)
	})
})

describe('messageOutcome', () => {
	it('a complete message passes', () => {
		expect(messageOutcome(MESSAGE)).to.equal(undefined)
	})

	describe('subject', () => {
		it('missing or empty gives MessageValidationEmptySubject', () => {
			expect(messageOutcome(withoutKey('subject'))).to.deep.equal({ name: 'MessageValidationEmptySubject' })
			expect(messageOutcome(withMessage({ subject: '' }))).to.deep.equal({ name: 'MessageValidationEmptySubject' })
		})
	})

	describe('from address', () => {
		it('missing address gives EmailAddressValidationMissingFrom', () => {
			expect(messageOutcome(withMessage({ from: {} }))).to.deep.equal({ name: 'EmailAddressValidationMissingFrom' })
			expect(messageOutcome(withMessage({ from: { friendlyName: 'Only Name' } }))).to.deep.equal({
				name: 'EmailAddressValidationMissingFrom'
			})
			expect(messageOutcome(withMessage({ from: { emailAddress: '' } }))).to.deep.equal({ name: 'EmailAddressValidationMissingFrom' })
		})

		for (const bad of ['nope', 'a@b@c', '@b.c', 'a@', '@', ' @b.c', 'a b@c.d', 'a@b c', 'a,b@c.d', 'a@b,c', 'a;b@c.d', 'a@b;c', 'a@\t', '\t@b.c', 'a@\n']) {
			it(`${JSON.stringify(bad)} gives EmailAddressValidationInvalidFrom`, () => {
				expect(messageOutcome(withMessage({ from: { emailAddress: bad } }))).to.deep.equal({
					name: 'EmailAddressValidationInvalidFrom'
				})
			})
		}

		it('320 characters is the longest accepted, 321 is not', () => {
			const address = (length: number) => `${'a'.repeat(length - 'b@c.de'.length)}b@c.de`
			expect(address(320)).to.have.lengthOf(320)
			expect(messageOutcome(withMessage({ from: { emailAddress: address(320) } }))).to.equal(undefined)
			expect(messageOutcome(withMessage({ from: { emailAddress: address(321) } }))).to.deep.equal({
				name: 'EmailAddressValidationInvalidFrom'
			})
		})

		for (const good of ['a@b', 'a.b+c@d.example', "o'neil@example.org", 'a@b.c', 'ü@ö.de']) {
			it(`${good} is accepted`, () => {
				expect(messageOutcome(withMessage({ from: { emailAddress: good } }))).to.equal(undefined)
			})
		}
	})

	describe('body', () => {
		it('text only and html only both pass', () => {
			expect(messageOutcome(withoutKey('htmlBody'))).to.equal(undefined)
			expect(messageOutcome(withoutKey('textBody'))).to.equal(undefined)
		})

		it('neither, or both empty, gives MessageValidationEmptyMessage', () => {
			const none = { name: 'MessageValidationEmptyMessage' }
			const bare: Partial<ISocketLabsBasicMessage> = { ...MESSAGE }
			delete bare.htmlBody
			delete bare.textBody
			expect(messageOutcome(bare as ISocketLabsBasicMessage)).to.deep.equal(none)
			expect(messageOutcome(withMessage({ htmlBody: '', textBody: '' }))).to.deep.equal(none)
		})
	})

	describe('recipients', () => {
		it('none gives RecipientValidationNoneInMessage', () => {
			expect(messageOutcome(withMessage({ to: [] }))).to.deep.equal({ name: 'RecipientValidationNoneInMessage' })
		})

		it('an invalid one gives RecipientValidationInvalidRecipients with its address result', () => {
			expect(messageOutcome(withMessage({ to: [{ emailAddress: 'bad' }] }))).to.deep.equal({
				name: 'RecipientValidationInvalidRecipients',
				addressResults: [{ emailAddress: 'bad', accepted: false, errorCode: 'InvalidAddress' }]
			})
		})

		it('only the invalid ones are listed', () => {
			const outcome = messageOutcome(withMessage({ to: [{ emailAddress: 'a@b.c' }, { emailAddress: 'bad one' }, { emailAddress: 'd@e.f' }, { emailAddress: 'x@@y' }] }))
			expect(outcome?.addressResults).to.deep.equal([
				{ emailAddress: 'bad one', accepted: false, errorCode: 'InvalidAddress' },
				{ emailAddress: 'x@@y', accepted: false, errorCode: 'InvalidAddress' }
			])
		})

		it('a recipient with no address is invalid', () => {
			const outcome = messageOutcome(withMessage({ to: [{}] }))
			expect(outcome?.name).to.equal('RecipientValidationInvalidRecipients')
			expect(outcome?.addressResults).to.have.lengthOf(1)
		})

		it('a list of valid recipients passes', () => {
			expect(messageOutcome(withMessage({ to: [{ emailAddress: 'a@b.c' }, { emailAddress: 'd@e.f' }] }))).to.equal(undefined)
		})
	})

	describe('order of the checks', () => {
		const broken: ISocketLabsBasicMessage = { messageType: 'basic', from: {}, to: [] }

		it('subject first', () => {
			expect(messageOutcome(broken)?.name).to.equal('MessageValidationEmptySubject')
		})

		it('then a missing from', () => {
			expect(messageOutcome({ ...broken, subject: 's' })?.name).to.equal('EmailAddressValidationMissingFrom')
		})

		it('then an invalid from, before the body is looked at', () => {
			expect(messageOutcome({ ...broken, subject: 's', from: { emailAddress: 'bad' } })?.name).to.equal('EmailAddressValidationInvalidFrom')
		})

		it('then the body, before the recipients', () => {
			expect(messageOutcome({ ...broken, subject: 's', from: { emailAddress: 'a@b.c' } })?.name).to.equal('MessageValidationEmptyMessage')
		})

		it('then the recipients', () => {
			expect(messageOutcome({ ...broken, subject: 's', from: { emailAddress: 'a@b.c' }, textBody: 't' })?.name).to.equal(
				'RecipientValidationNoneInMessage'
			)
		})
	})
})

describe('buildInjectionRequest', () => {
	const UA = `@axiumine/koa-utils (nodejs ${process.version})`

	describe('a key of the form <20>.<40>', () => {
		const request = buildInjectionRequest(4321, BEARER_KEY, MESSAGE)

		it('travels as a bearer token, with exactly these headers', () => {
			expect(request.headers).to.deep.equal({
				'Content-Type': 'application/json;charset=utf-8',
				Accept: 'application/json',
				'User-Agent': UA,
				Authorization: `Bearer ${BEARER_KEY}`
			})
		})

		it('stays out of the body, which is exactly { serverId, messages } in the SDK key order', () => {
			expect(request.body).to.not.contain(BEARER_KEY)
			expect(request.body).to.equal(
				JSON.stringify({
					serverId: 4321,
					messages: [
						{
							subject: 'Subject line',
							htmlBody: '<p>Html body</p>',
							textBody: 'Text body',
							messageId: 'msg-1',
							from: { emailAddress: 'from@example.com', friendlyName: 'From Name' },
							to: [{ emailAddress: 'to@example.com' }]
						}
					]
				})
			)
		})

		it('a second dot later in the key changes nothing: the first one decides', () => {
			const key = `${'A'.repeat(20)}.${'b'.repeat(19)}.${'c'.repeat(20)}`
			expect(key).to.have.lengthOf(61)
			expect(buildInjectionRequest(1, key, MESSAGE).headers['Authorization']).to.equal(`Bearer ${key}`)
		})
	})

	describe('any other key', () => {
		const odd: [string, string][] = [
			['short', 'short-key'],
			['one character short', `${'A'.repeat(20)}.${'b'.repeat(39)}`],
			['one character long', `${'A'.repeat(20)}.${'b'.repeat(41)}`],
			['dot one place early', `${'A'.repeat(19)}.${'b'.repeat(41)}`],
			['dot one place late', `${'A'.repeat(21)}.${'b'.repeat(39)}`],
			['no dot', 'A'.repeat(61)],
			['dot only far in', `${'A'.repeat(45)}.${'b'.repeat(15)}`],
			['empty', '']
		]
		for (const [label, key] of odd) {
			it(`${label}: apiKey in the body, no Authorization header`, () => {
				const request = buildInjectionRequest(7, key, MESSAGE)
				expect(request.headers).to.not.have.property('Authorization')
				expect(request.headers).to.deep.equal({
					'Content-Type': 'application/json;charset=utf-8',
					Accept: 'application/json',
					'User-Agent': UA
				})
				const parsed = JSON.parse(request.body) as Record<string, unknown>
				expect(Object.keys(parsed)).to.deep.equal(['apiKey', 'serverId', 'messages'])
				expect(parsed['apiKey']).to.equal(key)
				expect(parsed['serverId']).to.equal(7)
			})
		}

		it('the key sits in the body once and in no header', () => {
			const request = buildInjectionRequest(7, 'plain-key-123', MESSAGE)
			expect(request.body.split('plain-key-123')).to.have.lengthOf(2)
			expect(JSON.stringify(request.headers)).to.not.contain('plain-key-123')
		})
	})

	describe('message fields', () => {
		const messageOf = (message: ISocketLabsBasicMessage) =>
			(JSON.parse(buildInjectionRequest(1, BEARER_KEY, message).body) as { messages: Record<string, unknown>[] }).messages

		it('exactly one message in the list', () => {
			expect(messageOf(MESSAGE)).to.have.lengthOf(1)
		})

		for (const [key, field] of [
			['textBody', 'textBody'],
			['htmlBody', 'htmlBody'],
			['messageId', 'messageId']
		] as const) {
			it(`no ${key}: the JSON has no ${field} key and no "undefined"`, () => {
				const request = buildInjectionRequest(1, BEARER_KEY, withoutKey(key))
				expect(messageOf(withoutKey(key))[0]).to.not.have.property(field)
				expect(request.body).to.not.contain('undefined')
			})
		}

		it('no friendlyName: from is the address only', () => {
			expect(messageOf(withMessage({ from: { emailAddress: 'a@b.c' } }))[0]?.['from']).to.deep.equal({ emailAddress: 'a@b.c' })
		})

		it('several recipients keep their order, each with its own friendlyName if set', () => {
			const to = [{ emailAddress: 'a@b.c' }, { emailAddress: 'd@e.f', friendlyName: 'D E' }]
			expect(messageOf(withMessage({ to }))[0]?.['to']).to.deep.equal(to)
		})

		it('quotes, backslashes, newlines and non-ASCII text survive as JSON', () => {
			const subject = 'He said "hi" \\ line\nbreak ü ✓ 你好'
			expect(messageOf(withMessage({ subject }))[0]?.['subject']).to.equal(subject)
		})
	})
})
