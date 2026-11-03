import { createSocketLabsSender } from '../../dist/email/createSocketLabsSender.mjs'
import type { ISocketLabsClient } from '../../dist/email/ISocketLabsClient.mjs'
import type { ISocketLabsMessage } from '../../dist/email/ISocketLabsMessage.mjs'
import { BasicMessage, SocketLabsClient } from '@socketlabs/email'
import { expect } from 'chai'
import sinon from 'sinon'

// shape of BasicMessage as handed to client.send. Fields read back, SDK ships no types
interface ISentMessage {
	from?: { emailAddress?: string; friendlyName?: string }
	to: { emailAddress?: string }[]
	subject?: string
	textBody?: string
	htmlBody?: string
	messageId?: string
}

// real-client fields the SDK keeps on the instance
interface IRealClient {
	serverId: unknown
	apiKey: unknown
	requestTimeout: number
	numberOfRetries: number
	endpointUrl: string
	proxy?: string
}

const MESSAGE: ISocketLabsMessage = {
	from: 'from@example.com',
	fromName: 'From Name',
	to: 'to@example.com',
	subject: 'Subject line',
	text: 'Text body',
	html: '<p>Html body</p>',
	messageId: 'msg-1'
}

const sentOf = (send: sinon.SinonStub, call = 0): ISentMessage => send.getCall(call).args[0] as ISentMessage

// ok client double: send resolves, ISocketLabsClient shape only
const okClient = (resolveWith: unknown = {}) => {
	const send = sinon.stub().resolves(resolveWith)
	const client: ISocketLabsClient = { send }
	return { client, send }
}

// client double that rejects with `rejection`, any type
const rejectingClient = (rejection: unknown) => {
	const send = sinon.stub().callsFake(() => Promise.reject(rejection))
	const client: ISocketLabsClient = { send }
	return { client, send }
}

// credentials never used when client injected
const CREDS = { serverId: 4321, apiKey: 'creds-api-key' }

// settle a promise → reason, undefined when it resolved
async function reasonOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise
	} catch (err: unknown) {
		return err
	}
	return undefined
}

// SDK rejection shape: SendResponse, result = enum value
const sendResponseLike = (name: string) => ({
	transactionReceipt: null,
	addressResults: null,
	result: { name, value: 1, message: `msg of ${name}` },
	responseMessage: `msg of ${name}`
})

describe('createSocketLabsSender', () => {
	afterEach(() => sinon.restore())

	describe('success', () => {
		it('resolves exactly { ok: true } and calls send once with a BasicMessage', async () => {
			const { client, send } = okClient()
			const onError = sinon.spy()
			const result = await createSocketLabsSender({ ...CREDS, client, onError })(MESSAGE)
			expect(result).to.deep.equal({ ok: true })
			expect(Object.keys(result)).to.deep.equal(['ok'])
			expect(send.calledOnce).to.equal(true)
			expect(send.firstCall.args).to.have.lengthOf(1)
			expect(send.firstCall.args[0]).to.be.instanceOf(BasicMessage)
			expect(onError.called).to.equal(false)
		})

		it('ignores what the client resolves with', async () => {
			const { client } = okClient({ result: { name: 'Warning' }, addressResults: [{ emailAddress: 'to@example.com' }] })
			expect(await createSocketLabsSender({ ...CREDS, client })(MESSAGE)).to.deep.equal({ ok: true })
		})

		it('builds a fresh message per call, no field leaks from the previous one', async () => {
			const { client, send } = okClient()
			const sender = createSocketLabsSender({ ...CREDS, client })
			await sender(MESSAGE)
			await sender({ from: 'b@example.com', to: 'c@example.com', subject: 'Second', text: 'only text' })
			const [first, second] = [sentOf(send, 0), sentOf(send, 1)]
			expect(first).to.not.equal(second)
			expect(second.to).to.have.lengthOf(1)
			expect(second.to[0]?.emailAddress).to.equal('c@example.com')
			expect(second.htmlBody).to.equal(undefined)
			expect(second.messageId).to.equal(undefined)
			expect(second.from?.friendlyName).to.equal(undefined)
			expect(first.to).to.have.lengthOf(1)
			expect(first.htmlBody).to.equal('<p>Html body</p>')
		})
	})

	describe('message content', () => {
		it('maps every field onto the BasicMessage', async () => {
			const { client, send } = okClient()
			await createSocketLabsSender({ ...CREDS, client })(MESSAGE)
			const sent = sentOf(send)
			expect(sent.from?.emailAddress).to.equal('from@example.com')
			expect(sent.from?.friendlyName).to.equal('From Name')
			expect(sent.to).to.have.lengthOf(1)
			expect(sent.to[0]?.emailAddress).to.equal('to@example.com')
			expect(sent.subject).to.equal('Subject line')
			expect(sent.textBody).to.equal('Text body')
			expect(sent.htmlBody).to.equal('<p>Html body</p>')
			expect(sent.messageId).to.equal('msg-1')
		})

		it('sends the html as given: no wrapper, no escaping', async () => {
			const { client, send } = okClient()
			const html = '<!DOCTYPE html><title>t</title> & <b>"x"</b>'
			await createSocketLabsSender({ ...CREDS, client })({ ...MESSAGE, html })
			expect(sentOf(send).htmlBody).to.equal(html)
		})

		it('leaves the friendly name unset when fromName is absent', async () => {
			const { client, send } = okClient()
			const { fromName: _omitted, ...withoutName } = MESSAGE
			await createSocketLabsSender({ ...CREDS, client })(withoutName)
			const from = sentOf(send).from
			expect(from?.emailAddress).to.equal('from@example.com')
			expect(from).to.not.have.property('friendlyName')
		})

		it('accepts an explicit undefined for every optional field', async () => {
			const { client, send } = okClient()
			await createSocketLabsSender({ ...CREDS, client })({
				...MESSAGE,
				fromName: undefined,
				text: 'kept',
				html: undefined,
				messageId: undefined
			})
			const sent = sentOf(send)
			expect(sent.from).to.not.have.property('friendlyName')
			expect(sent).to.not.have.property('htmlBody')
			expect(sent).to.not.have.property('messageId')
			expect(sent.textBody).to.equal('kept')
		})

		it('text-only: no htmlBody on the message', async () => {
			const { client, send } = okClient()
			const { html: _omitted, ...textOnly } = MESSAGE
			await createSocketLabsSender({ ...CREDS, client })(textOnly)
			const sent = sentOf(send)
			expect(sent.textBody).to.equal('Text body')
			expect(sent).to.not.have.property('htmlBody')
		})

		it('html-only: no textBody on the message', async () => {
			const { client, send } = okClient()
			const { text: _omitted, ...htmlOnly } = MESSAGE
			await createSocketLabsSender({ ...CREDS, client })(htmlOnly)
			const sent = sentOf(send)
			expect(sent.htmlBody).to.equal('<p>Html body</p>')
			expect(sent).to.not.have.property('textBody')
		})

		it('no messageId: none set on the message', async () => {
			const { client, send } = okClient()
			const { messageId: _omitted, ...noId } = MESSAGE
			await createSocketLabsSender({ ...CREDS, client })(noId)
			expect(sentOf(send)).to.not.have.property('messageId')
		})

		it('calls the setters in the order from, subject, text, html, to, messageId', async () => {
			const proto = BasicMessage.prototype as Record<string, () => void>
			const names = ['setFromAddress', 'setSubject', 'setTextBody', 'setHtmlBody', 'setTo', 'setMessageId'] as const
			const spies = names.map((name) => sinon.spy(proto, name))
			const { client } = okClient()
			await createSocketLabsSender({ ...CREDS, client })(MESSAGE)
			sinon.assert.callOrder(...spies)
			spies.forEach((spy) => sinon.assert.calledOnce(spy))
		})

		it('passes from + fromName to setFromAddress and the message id to setMessageId', async () => {
			const proto = BasicMessage.prototype as Record<string, () => void>
			const fromSpy = sinon.spy(proto, 'setFromAddress')
			const idSpy = sinon.spy(proto, 'setMessageId')
			const { client } = okClient()
			await createSocketLabsSender({ ...CREDS, client })(MESSAGE)
			expect(fromSpy.firstCall.args).to.deep.equal(['from@example.com', 'From Name'])
			expect(idSpy.firstCall.args).to.deep.equal(['msg-1'])
		})
	})

	describe('failure', () => {
		const SHAPES: [string, unknown, string][] = [
			['SendResponse-like with a Timeout result', sendResponseLike('Timeout'), 'Timeout'],
			['SendResponse-like with an InvalidAuthentication result', sendResponseLike('InvalidAuthentication'), 'InvalidAuthentication'],
			['SendResponse-like with a Warning result', sendResponseLike('Warning'), 'Warning'],
			['SendResponse-like whose enum name holds a space', sendResponseLike('Service Unavailable'), 'Service Unavailable'],
			['Error', new Error('boom'), 'UnknownError'],
			['TypeError', new TypeError('bad'), 'UnknownError'],
			['string', 'plain text', 'UnknownError'],
			['empty string', '', 'UnknownError'],
			['number', 42, 'UnknownError'],
			['null', null, 'UnknownError'],
			['undefined', undefined, 'UnknownError'],
			['object without result', { responseMessage: 'x' }, 'UnknownError'],
			['object with result null', { result: null }, 'UnknownError'],
			['object with result undefined', { result: undefined }, 'UnknownError'],
			['object with result without name', { result: { value: 1 } }, 'UnknownError'],
			['object with a numeric result name', { result: { name: 5 } }, 'UnknownError'],
			['object with a null result name', { result: { name: null } }, 'UnknownError'],
			['object with an empty-string result name', { result: { name: '' } }, '']
		]

		for (const [label, rejection, code] of SHAPES) {
			it(`${label}: resolves { ok: false, code: ${JSON.stringify(code)} } and calls onError once with the raw value`, async () => {
				const { client, send } = rejectingClient(rejection)
				const onError = sinon.spy()
				const result = await createSocketLabsSender({ ...CREDS, client, onError })(MESSAGE)
				expect(result).to.deep.equal({ ok: false, code })
				expect(Object.keys(result).sort()).to.deep.equal(['code', 'ok'])
				expect(send.calledOnce).to.equal(true)
				expect(onError.calledOnce).to.equal(true)
				expect(onError.firstCall.args).to.have.lengthOf(1)
				// identity, not a copy
				expect(onError.firstCall.args[0]).to.equal(rejection)
			})

			it(`${label}: same result without onError`, async () => {
				const { client } = rejectingClient(rejection)
				expect(await createSocketLabsSender({ ...CREDS, client })(MESSAGE)).to.deep.equal({ ok: false, code })
			})
		}

		it('a throwing onError rejects the promise with its error', async () => {
			const { client } = rejectingClient(sendResponseLike('Timeout'))
			const boom = new Error('onError boom')
			const sender = createSocketLabsSender({
				...CREDS,
				client,
				onError: () => {
					throw boom
				}
			})
			expect(await reasonOf(sender(MESSAGE))).to.equal(boom)
		})

		it('a synchronous throw from client.send rejects and onError is not called', async () => {
			const boom = new Error('sync send boom')
			const client: ISocketLabsClient = {
				send: () => {
					throw boom
				}
			}
			const onError = sinon.spy()
			const sender = createSocketLabsSender({ ...CREDS, client, onError })
			expect(await reasonOf(sender(MESSAGE))).to.equal(boom)
			expect(onError.called).to.equal(false)
		})

		it('a setter that throws rejects, client.send is never called and onError is not called', async () => {
			const { client, send } = okClient()
			const onError = sinon.spy()
			const sender = createSocketLabsSender({ ...CREDS, client, onError })
			// cast → feed a non-string subject on purpose, SDK setSubject throws on it
			const reason = await reasonOf(sender({ ...MESSAGE, subject: 5 as unknown as string }))
			expect(reason).to.be.instanceOf(Error)
			expect((reason as Error).message).to.contain('Invalid subject')
			expect(send.called).to.equal(false)
			expect(onError.called).to.equal(false)
		})

		it('a setter throw is a rejected promise, never a synchronous throw', () => {
			const { client } = okClient()
			const sender = createSocketLabsSender({ ...CREDS, client })
			// cast → feed non-string subject on purpose
			const promise = sender({ ...MESSAGE, subject: 5 as unknown as string })
			expect(promise).to.be.instanceOf(Promise)
			return promise.then(
				() => expect.fail('should reject'),
				() => undefined
			)
		})
	})

	describe('hygiene: nothing but ok and code leaves', () => {
		const KEY = 'PLANTED-API-KEY-5f3a'
		const BODY = 'PLANTED-BODY-one-time-code-918273'
		const RECIPIENT = 'planted.recipient@example.org'

		const planted = (value: unknown) => JSON.stringify(value)

		const expectClean = (value: unknown) => {
			const text = planted(value)
			expect(text).to.not.contain(KEY)
			expect(text).to.not.contain(BODY)
			expect(text).to.not.contain(RECIPIENT)
		}

		it('a SendResponse rejection that carries all three gives only { ok, code }', async () => {
			const rejection = {
				...sendResponseLike('Timeout'),
				responseMessage: `${KEY} ${BODY} ${RECIPIENT}`,
				addressResults: [{ emailAddress: RECIPIENT, accepted: false, errorCode: BODY }],
				transactionReceipt: KEY
			}
			const { client } = rejectingClient(rejection)
			const result = await createSocketLabsSender({ serverId: 1, apiKey: KEY, client })({
				...MESSAGE,
				to: RECIPIENT,
				text: BODY,
				html: `<p>${BODY}</p>`
			})
			expect(result).to.deep.equal({ ok: false, code: 'Timeout' })
			expectClean(result)
		})

		it('an Error whose message and fields hold them gives only { ok, code: UnknownError }', async () => {
			const error = Object.assign(new Error(`${KEY} ${BODY} ${RECIPIENT}`), { config: { data: BODY, headers: KEY } })
			const { client } = rejectingClient(error)
			const result = await createSocketLabsSender({ serverId: 1, apiKey: KEY, client })({
				...MESSAGE,
				to: RECIPIENT,
				text: BODY
			})
			expect(result).to.deep.equal({ ok: false, code: 'UnknownError' })
			expectClean(result)
		})

		it('a string rejection that holds them gives only { ok, code: UnknownError }', async () => {
			const { client } = rejectingClient(`${KEY} ${BODY} ${RECIPIENT}`)
			const result = await createSocketLabsSender({ serverId: 1, apiKey: KEY, client })(MESSAGE)
			expect(result).to.deep.equal({ ok: false, code: 'UnknownError' })
			expectClean(result)
		})

		it('a resolved send whose value holds them still gives exactly { ok: true }', async () => {
			const { client } = okClient({ addressResults: [{ emailAddress: RECIPIENT }], transactionReceipt: KEY, body: BODY })
			const result = await createSocketLabsSender({ serverId: 1, apiKey: KEY, client })({ ...MESSAGE, to: RECIPIENT })
			expect(result).to.deep.equal({ ok: true })
			expectClean(result)
		})

		it('the RangeError text never holds the api key', () => {
			const attempts = [{ requestTimeout: 0 }, { requestTimeout: NaN }, { numberOfRetries: 6 }, { numberOfRetries: NaN }]
			for (const bad of attempts) {
				let thrown: unknown
				try {
					createSocketLabsSender({ serverId: 1, apiKey: KEY, ...bad })
				} catch (err: unknown) {
					thrown = err
				}
				expect(thrown).to.be.instanceOf(RangeError)
				expect((thrown as RangeError).message).to.not.contain(KEY)
				expect(JSON.stringify(thrown)).to.not.contain(KEY)
			}
		})
	})

	describe('real SocketLabsClient', () => {
		// stub send on the real prototype → no network. thisValues[0] = the client the sender built
		const builtClient = async (options: Parameters<typeof createSocketLabsSender>[0]): Promise<IRealClient> => {
			const send = sinon.stub(SocketLabsClient.prototype as { send: () => Promise<unknown> }, 'send').resolves({})
			await createSocketLabsSender(options)(MESSAGE)
			expect(send.calledOnce).to.equal(true)
			return send.thisValues[0] as IRealClient
		}

		it('defaults: requestTimeout 120 and numberOfRetries 3, with the given serverId and apiKey', async () => {
			const client = await builtClient({ serverId: 777, apiKey: 'real-key' })
			expect(client).to.be.instanceOf(SocketLabsClient)
			expect(client.serverId).to.equal(777)
			expect(client.apiKey).to.equal('real-key')
			expect(client.requestTimeout).to.equal(120)
			expect(client.numberOfRetries).to.equal(3)
		})

		it('overridden: requestTimeout 30 and numberOfRetries 5', async () => {
			const client = await builtClient({ serverId: 1, apiKey: 'k', requestTimeout: 30, numberOfRetries: 5 })
			expect(client.requestTimeout).to.equal(30)
			expect(client.numberOfRetries).to.equal(5)
		})

		it('overridden: numberOfRetries 0 stays 0 and requestTimeout keeps a fraction', async () => {
			const client = await builtClient({ serverId: 1, apiKey: 'k', requestTimeout: 0.5, numberOfRetries: 0 })
			expect(client.requestTimeout).to.equal(0.5)
			expect(client.numberOfRetries).to.equal(0)
		})

		it('explicit undefined for both options gives the defaults', async () => {
			const client = await builtClient({ serverId: 1, apiKey: 'k', requestTimeout: undefined, numberOfRetries: undefined })
			expect(client.requestTimeout).to.equal(120)
			expect(client.numberOfRetries).to.equal(3)
		})

		it('keeps the SDK default endpoint and sets no proxy', async () => {
			const client = await builtClient({ serverId: 1, apiKey: 'k' })
			expect(client.endpointUrl).to.equal('https://inject.socketlabs.com/api/v1/email')
			expect(client).to.not.have.property('proxy')
		})

		it('builds the client once, when the sender is created', async () => {
			const send = sinon.stub(SocketLabsClient.prototype as { send: () => Promise<unknown> }, 'send').resolves({})
			const sender = createSocketLabsSender({ serverId: 1, apiKey: 'k' })
			await sender(MESSAGE)
			await sender(MESSAGE)
			expect(send.thisValues[0]).to.equal(send.thisValues[1])
		})

		it('reads no environment: SOCKETLABS_* decoys change nothing', async () => {
			const saved = [process.env['SOCKETLABS_SERVER_ID'], process.env['SOCKETLABS_SERVER_APIKEY']]
			process.env['SOCKETLABS_SERVER_ID'] = '999'
			process.env['SOCKETLABS_SERVER_APIKEY'] = 'env-decoy-key'
			try {
				const client = await builtClient({ serverId: 55, apiKey: 'option-key' })
				expect(client.serverId).to.equal(55)
				expect(client.apiKey).to.equal('option-key')
			} finally {
				for (const [i, name] of ['SOCKETLABS_SERVER_ID', 'SOCKETLABS_SERVER_APIKEY'].entries()) {
					const value = saved[i]
					if (value === undefined) delete process.env[name as string]
					else process.env[name as string] = value
				}
			}
		})

		it('bad credentials reject inside the SDK and come back as a code, no network', async () => {
			// serverId 0 → SDK validateCredentials rejects before any HTTP call
			const onError = sinon.spy()
			const result = await createSocketLabsSender({ serverId: 0, apiKey: 'x', onError })(MESSAGE)
			expect(result).to.deep.equal({ ok: false, code: 'AuthenticationValidationFailed' })
			expect(onError.calledOnce).to.equal(true)
		})

		it('creating a sender validates nothing about serverId and apiKey', () => {
			expect(() => createSocketLabsSender({ serverId: 0, apiKey: '' })).to.not.throw()
			expect(() => createSocketLabsSender({ serverId: NaN, apiKey: 'undefined' })).to.not.throw()
		})
	})

	describe('injected client', () => {
		it('is used instead of a SocketLabsClient and ignores serverId and apiKey', async () => {
			const realSend = sinon.stub(SocketLabsClient.prototype as { send: () => Promise<unknown> }, 'send').resolves({})
			const { client, send } = okClient()
			// cast → junk credentials on purpose, must be ignored
			const sender = createSocketLabsSender({ serverId: NaN, apiKey: undefined as unknown as string, client })
			expect(await sender(MESSAGE)).to.deep.equal({ ok: true })
			expect(send.calledOnce).to.equal(true)
			expect(realSend.called).to.equal(false)
		})

		it('is called as a method: this is the client object', async () => {
			const seen: unknown[] = []
			const client: ISocketLabsClient = {
				send(this: unknown) {
					seen.push(this)
					return Promise.resolve({})
				}
			}
			await createSocketLabsSender({ ...CREDS, client })(MESSAGE)
			expect(seen[0]).to.equal(client)
		})

		it('explicit undefined client builds the real one', async () => {
			const realSend = sinon.stub(SocketLabsClient.prototype as { send: () => Promise<unknown> }, 'send').resolves({})
			await createSocketLabsSender({ ...CREDS, client: undefined })(MESSAGE)
			expect(realSend.calledOnce).to.equal(true)
		})

		it('still checks requestTimeout and numberOfRetries', () => {
			const { client } = okClient()
			expect(() => createSocketLabsSender({ ...CREDS, client, requestTimeout: 0 })).to.throw(RangeError)
			expect(() => createSocketLabsSender({ ...CREDS, client, numberOfRetries: 6 })).to.throw(RangeError)
		})
	})

	describe('option validation', () => {
		const TIMEOUT_TEXT = 'requestTimeout must be a finite number of seconds above 0'
		const RETRIES_TEXT = 'numberOfRetries must be an integer from 0 to 5'

		for (const bad of [0, -1, -0.5, NaN, Infinity, -Infinity]) {
			it(`requestTimeout ${String(bad)} throws RangeError when the sender is created`, () => {
				const attempt = () => createSocketLabsSender({ ...CREDS, requestTimeout: bad })
				expect(attempt).to.throw(RangeError, TIMEOUT_TEXT)
			})
		}

		for (const bad of [-1, 6, 100, NaN, 1.5, 0.5, Infinity, -Infinity]) {
			it(`numberOfRetries ${String(bad)} throws RangeError when the sender is created`, () => {
				const attempt = () => createSocketLabsSender({ ...CREDS, numberOfRetries: bad })
				expect(attempt).to.throw(RangeError, RETRIES_TEXT)
			})
		}

		it('the errors are exactly the documented text, no value echoed', () => {
			let timeout: unknown
			let retries: unknown
			try {
				createSocketLabsSender({ ...CREDS, requestTimeout: -7 })
			} catch (err: unknown) {
				timeout = err
			}
			try {
				createSocketLabsSender({ ...CREDS, numberOfRetries: 9 })
			} catch (err: unknown) {
				retries = err
			}
			expect((timeout as RangeError).message).to.equal(TIMEOUT_TEXT)
			expect((retries as RangeError).message).to.equal(RETRIES_TEXT)
		})

		it('a bad requestTimeout wins when both options are bad', () => {
			const attempt = () => createSocketLabsSender({ ...CREDS, requestTimeout: 0, numberOfRetries: 9 })
			expect(attempt).to.throw(RangeError, TIMEOUT_TEXT)
		})

		for (const ok of [0.001, 1, 120, 3600]) {
			it(`requestTimeout ${ok} is accepted`, () => {
				expect(() => createSocketLabsSender({ ...CREDS, requestTimeout: ok })).to.not.throw()
			})
		}

		for (const ok of [0, 1, 3, 5]) {
			it(`numberOfRetries ${ok} is accepted`, () => {
				expect(() => createSocketLabsSender({ ...CREDS, numberOfRetries: ok })).to.not.throw()
			})
		}

		it('returns a function', () => {
			expect(createSocketLabsSender(CREDS)).to.be.a('function')
		})
	})
})
