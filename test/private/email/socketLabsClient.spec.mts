/**
 * Spec private/email/socketLabsClient.mts
 *
 * Built-in fetch client vs local node:http server (127.0.0.1, port 0). No internet, fake keys only.
 * Default endpoint / sleep / random → fetch stub + fake timers, still no network.
 */
import { buildBasicMessage } from '@private/email/socketLabsMessage.mjs'
import { backoffMs, createSocketLabsClient, type ISocketLabsClientOptions } from '@private/email/socketLabsClient.mjs'
import { SocketLabsSendError } from '@private/email/SocketLabsSendError.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import {
	closedPortUrl,
	type IFakeServer,
	replyNever,
	replyReset,
	replySequence,
	replyWith,
	startFakeServer,
	SUCCESS_BODY,
	type TReply
} from '../../helpers/fakeInjectionServer.mjs'

// fake keys only. 20 + '.' + 40 = 61 chars → bearer form
const BEARER_KEY = `${'A'.repeat(20)}.${'b'.repeat(40)}`
const PLAIN_KEY = 'plain-fake-key'
const MESSAGE = buildBasicMessage({
	from: 'from@example.com',
	fromName: 'From Name',
	to: 'to@example.com',
	subject: 'Subject line',
	text: 'Text body',
	html: '<p>Html body</p>',
	messageId: 'msg-1'
})

// settle → rejection, fail when it resolved
async function rejectionOf(promise: Promise<unknown>): Promise<SocketLabsSendError> {
	try {
		await promise
	} catch (err: unknown) {
		expect(err).to.be.instanceOf(SocketLabsSendError)
		return err as SocketLabsSendError
	}
	return expect.fail('should reject')
}

describe('backoffMs', () => {
	// random 0 → factor 1, random 0.5 → 1.5. min 1000, x2 per retry, cap 10000
	it('random 0: 1 s, 2 s, 4 s, 8 s, then the 10 s cap', () => {
		expect([0, 1, 2, 3, 4, 5, 9].map((retry) => backoffMs(retry, () => 0))).to.deep.equal([1000, 2000, 4000, 8000, 10000, 10000, 10000])
	})

	it('random 0.5: 1.5 s, 3 s, 6 s, then capped', () => {
		expect([0, 1, 2, 3, 4].map((retry) => backoffMs(retry, () => 0.5))).to.deep.equal([1500, 3000, 6000, 10000, 10000])
	})

	it('random just under 1 stays under twice the base', () => {
		expect(backoffMs(0, () => 0.999)).to.be.closeTo(1999, 1e-9)
		expect(backoffMs(2, () => 0.999)).to.be.closeTo(7996, 1e-9)
	})

	it('asks random once per call, with no argument', () => {
		const random = sinon.stub().returns(0.25)
		expect(backoffMs(1, random)).to.equal(2500)
		expect(random.calledOnce).to.equal(true)
		expect(random.firstCall.args).to.have.lengthOf(0)
	})
})

describe('createSocketLabsClient', () => {
	let server: IFakeServer | undefined
	let sleeps: number[]

	// every test starts its own server through serve(); afterEach closes it and restores stubs
	const serve = async (reply: TReply): Promise<IFakeServer> => {
		server = await startFakeServer(reply)
		return server
	}

	const clientFor = (fake: IFakeServer, extra: Partial<ISocketLabsClientOptions> = {}) =>
		createSocketLabsClient({
			serverId: 4321,
			apiKey: BEARER_KEY,
			requestTimeout: 5,
			numberOfRetries: 0,
			endpointUrl: fake.endpointUrl,
			sleep: (ms) => {
				sleeps.push(ms)
				return Promise.resolve()
			},
			random: () => 0,
			...extra
		})

	beforeEach(() => {
		sleeps = []
	})

	afterEach(async () => {
		sinon.restore()
		await server?.close()
		server = undefined
	})

	describe('the request', () => {
		it('is one POST to the endpoint path', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			await clientFor(fake).send(MESSAGE)
			expect(fake.requests).to.have.lengthOf(1)
			expect(fake.requests[0]?.method).to.equal('POST')
			expect(fake.requests[0]?.path).to.equal('/api/v1/email')
		})

		it('has the bearer headers, and a content-length that counts bytes', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			await clientFor(fake).send(MESSAGE)
			const headers = fake.requests[0]?.headers
			expect(headers?.['authorization']).to.equal(`Bearer ${BEARER_KEY}`)
			expect(headers?.['content-type']).to.equal('application/json;charset=utf-8')
			expect(headers?.['accept']).to.equal('application/json')
			expect(headers?.['user-agent']).to.equal(`@axiumine/koa-utils (nodejs ${process.version})`)
			expect(headers?.['content-length']).to.equal(String(Buffer.byteLength(fake.requests[0]?.body ?? '')))
		})

		it('has the exact JSON body, { serverId, messages } with no key in it', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			await clientFor(fake).send(MESSAGE)
			expect(fake.requests[0]?.body).to.equal(
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

		it('a key that is not <20>.<40> goes in the body and there is no Authorization header', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			await clientFor(fake, { apiKey: PLAIN_KEY, serverId: 77 }).send(MESSAGE)
			const request = fake.requests[0]
			expect(request?.headers).to.not.have.property('authorization')
			const body = JSON.parse(request?.body ?? '{}') as Record<string, unknown>
			expect(Object.keys(body)).to.deep.equal(['apiKey', 'serverId', 'messages'])
			expect(body['apiKey']).to.equal(PLAIN_KEY)
			expect(body['serverId']).to.equal(77)
		})

		it('non-ASCII text arrives intact, counted in bytes', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			const message = buildBasicMessage({ from: 'a@b.c', to: 'd@e.f', subject: 'Ciao ü ✓ 你好', text: 'tëxt' })
			await clientFor(fake).send(message)
			const request = fake.requests[0]
			expect((JSON.parse(request?.body ?? '{}') as { messages: { subject: string }[] }).messages[0]?.subject).to.equal('Ciao ü ✓ 你好')
			expect(request?.headers['content-length']).to.equal(String(Buffer.byteLength(request?.body ?? '')))
		})

		it('send does not need its client as this', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			const { send } = clientFor(fake)
			expect(await send(MESSAGE)).to.deep.equal({ name: 'Success' })
		})
	})

	describe('what a 200 answer gives', () => {
		it('Success resolves with the outcome', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			expect(await clientFor(fake).send(MESSAGE)).to.deep.equal({ name: 'Success' })
		})

		it('Success with a receipt resolves with it', async () => {
			const fake = await serve(replyWith(200, JSON.stringify({ ErrorCode: 'Success', TransactionReceipt: 'rcpt-1' })))
			expect(await clientFor(fake).send(MESSAGE)).to.deep.equal({ name: 'Success', transactionReceipt: 'rcpt-1' })
		})

		for (const code of ['InternalError', 'OverQuota', 'InvalidAuthentication', 'AccountDisabled', 'InvalidData', 'MessageTooLarge', 'TooManyErrors']) {
			it(`${code} rejects with result.name ${code}, one request, no retry`, async () => {
				const fake = await serve(replyWith(200, JSON.stringify({ ErrorCode: code })))
				const err = await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
				expect(err.result).to.deep.equal({ name: code })
				expect(err.message).to.equal(`SocketLabs send failed: ${code}`)
				expect(fake.requests).to.have.lengthOf(1)
				expect(sleeps).to.deep.equal([])
			})
		}

		it('Warning with a rejected recipient rejects with the message-level code and keeps the details', async () => {
			const answer = {
				ErrorCode: 'Warning',
				TransactionReceipt: 'rcpt-2',
				MessageResults: [{ Index: 0, ErrorCode: 'InvalidAddress', AddressResults: [{ EmailAddress: 'bad', Accepted: false }] }]
			}
			const fake = await serve(replyWith(200, JSON.stringify(answer)))
			const err = await rejectionOf(clientFor(fake).send(MESSAGE))
			expect(err.result).to.deep.equal({ name: 'InvalidAddress' })
			expect(err.transactionReceipt).to.equal('rcpt-2')
			expect(err.addressResults).to.deep.equal([{ EmailAddress: 'bad', Accepted: false }])
		})

		it('Warning with nothing more rejects as Warning', async () => {
			const fake = await serve(replyWith(200, JSON.stringify({ ErrorCode: 'Warning' })))
			expect((await rejectionOf(clientFor(fake).send(MESSAGE))).result).to.deep.equal({ name: 'Warning' })
		})

		it('Warning whose first message result is Success resolves, as in the SDK', async () => {
			const fake = await serve(replyWith(200, JSON.stringify({ ErrorCode: 'Warning', MessageResults: [{ ErrorCode: 'Success' }] })))
			expect(await clientFor(fake).send(MESSAGE)).to.deep.equal({ name: 'Success' })
		})

		const unclassified: [string, string][] = [
			['an unknown code', JSON.stringify({ ErrorCode: 'Bogus' })],
			['no code', '{}'],
			['an empty body', ''],
			['a body that is not JSON', 'OK'],
			['JSON that is not an object', '"Success"'],
			['JSON null', 'null']
		]
		for (const [label, text] of unclassified) {
			it(`${label} rejects, and the code seen by the sender is UnknownError`, async () => {
				const fake = await serve(replyWith(200, text))
				const err = await rejectionOf(clientFor(fake).send(MESSAGE))
				expect(err.result?.name ?? 'UnknownError').to.equal('UnknownError')
				expect(err.message).to.equal('SocketLabs send failed: UnknownError')
				expect(fake.requests).to.have.lengthOf(1)
			})
		}
	})

	describe('other 2xx and 3xx, and 4xx', () => {
		// success body on purpose: only status counts. 408 + 429 not retried either, as in the SDK
		for (const status of [201, 202, 204, 400, 401, 403, 404, 408, 413, 422, 429]) {
			it(`${status} rejects with no result and is never retried`, async () => {
				const fake = await serve(replyWith(status, SUCCESS_BODY))
				const err = await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
				expect(err.result).to.equal(undefined)
				expect(err.message).to.equal('SocketLabs send failed: UnknownError')
				expect(err.transactionReceipt).to.equal(null)
				expect(fake.requests).to.have.lengthOf(1)
				expect(sleeps).to.deep.equal([])
			})
		}
	})

	describe('5xx', () => {
		for (const status of [500, 502, 503, 504]) {
			it(`${status} is retried numberOfRetries times with the SDK back-off, then rejects with no result`, async () => {
				const fake = await serve(replyWith(status, '{"ErrorCode":"Success"}'))
				const err = await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
				expect(fake.requests).to.have.lengthOf(4)
				expect(sleeps).to.deep.equal([1000, 2000, 4000])
				expect(err.result).to.equal(undefined)
				expect(err.message).to.equal('SocketLabs send failed: UnknownError')
			})
		}

		for (const status of [501, 505, 507, 511, 599, 499]) {
			it(`${status} is not one of the retried statuses`, async () => {
				const fake = await serve(replyWith(status, ''))
				await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
				expect(fake.requests).to.have.lengthOf(1)
				expect(sleeps).to.deep.equal([])
			})
		}

		it('numberOfRetries 0 means one attempt and no wait', async () => {
			const fake = await serve(replyWith(503, ''))
			await rejectionOf(clientFor(fake, { numberOfRetries: 0 }).send(MESSAGE))
			expect(fake.requests).to.have.lengthOf(1)
			expect(sleeps).to.deep.equal([])
		})

		it('numberOfRetries 5 gives six attempts and the five waits 1, 2, 4, 8, 10 s', async () => {
			const fake = await serve(replyWith(502, ''))
			await rejectionOf(clientFor(fake, { numberOfRetries: 5 }).send(MESSAGE))
			expect(fake.requests).to.have.lengthOf(6)
			expect(sleeps).to.deep.equal([1000, 2000, 4000, 8000, 10000])
		})

		it('the waits use the random function: 0.5 gives 1.5 s, 3 s', async () => {
			const fake = await serve(replyWith(503, ''))
			await rejectionOf(clientFor(fake, { numberOfRetries: 2, random: () => 0.5 }).send(MESSAGE))
			expect(sleeps).to.deep.equal([1500, 3000])
		})

		it('recovers: two 503 then Success resolves after three attempts and two waits', async () => {
			const fake = await serve(replySequence(replyWith(503, ''), replyWith(503, ''), replyWith(200, SUCCESS_BODY)))
			expect(await clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE)).to.deep.equal({ name: 'Success' })
			expect(fake.requests).to.have.lengthOf(3)
			expect(sleeps).to.deep.equal([1000, 2000])
		})

		it('a 500 then an API-level code rejects with that code, no more attempts', async () => {
			const fake = await serve(replySequence(replyWith(500, ''), replyWith(200, '{"ErrorCode":"OverQuota"}'), replyWith(200, SUCCESS_BODY)))
			const err = await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
			expect(err.result).to.deep.equal({ name: 'OverQuota' })
			expect(fake.requests).to.have.lengthOf(2)
		})

		it('a 503 then a 401 stops at the 401', async () => {
			const fake = await serve(replySequence(replyWith(503, ''), replyWith(401, '')))
			await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
			expect(fake.requests).to.have.lengthOf(2)
			expect(sleeps).to.deep.equal([1000])
		})

		it('every retry sends the same headers and the same body', async () => {
			const fake = await serve(replyWith(503, ''))
			await rejectionOf(clientFor(fake, { numberOfRetries: 2 }).send(MESSAGE))
			const [first, ...rest] = fake.requests
			expect(rest).to.have.lengthOf(2)
			for (const request of rest) {
				expect(request.body).to.equal(first?.body)
				expect(request.headers['authorization']).to.equal(first?.headers['authorization'])
			}
		})

		it('does not honour Retry-After: the wait is the back-off', async () => {
			const fake = await serve(replyWith(503, '', { 'retry-after': '120' }))
			await rejectionOf(clientFor(fake, { numberOfRetries: 1 }).send(MESSAGE))
			expect(sleeps).to.deep.equal([1000])
		})

		it('a 5xx answer is not read as a result: its body is ignored', async () => {
			const fake = await serve(replyWith(500, JSON.stringify({ ErrorCode: 'OverQuota', TransactionReceipt: 'r' })))
			const err = await rejectionOf(clientFor(fake).send(MESSAGE))
			expect(err.result).to.equal(undefined)
			expect(err.transactionReceipt).to.equal(null)
		})
	})

	describe('timeout', () => {
		it('an answer that never comes rejects with Timeout once the time is up', async () => {
			const fake = await serve(replyNever)
			const started = Date.now()
			const err = await rejectionOf(clientFor(fake, { requestTimeout: 0.1 }).send(MESSAGE))
			expect(err.result).to.deep.equal({ name: 'Timeout' })
			expect(err.message).to.equal('SocketLabs send failed: Timeout')
			expect(Date.now() - started).to.be.within(80, 1500)
			expect(fake.requests).to.have.lengthOf(1)
		})

		it('is retried like a 5xx: 1 + numberOfRetries attempts, the same waits', async () => {
			const fake = await serve(replyNever)
			const err = await rejectionOf(clientFor(fake, { requestTimeout: 0.05, numberOfRetries: 2 }).send(MESSAGE))
			expect(err.result).to.deep.equal({ name: 'Timeout' })
			expect(fake.requests).to.have.lengthOf(3)
			expect(sleeps).to.deep.equal([1000, 2000])
		})

		it('a timeout then Success resolves', async () => {
			const fake = await serve(replySequence(replyNever, replyWith(200, SUCCESS_BODY)))
			expect(await clientFor(fake, { requestTimeout: 0.05, numberOfRetries: 1 }).send(MESSAGE)).to.deep.equal({ name: 'Success' })
			expect(fake.requests).to.have.lengthOf(2)
		})

		it('the time counts to the last byte: headers sent, body stalled, still Timeout', async () => {
			const stalled: TReply = (res) => {
				res.writeHead(200, { 'content-type': 'application/json' })
				res.write('{"ErrorCode":')
			}
			const fake = await serve(stalled)
			const err = await rejectionOf(clientFor(fake, { requestTimeout: 0.1 }).send(MESSAGE))
			expect(err.result).to.deep.equal({ name: 'Timeout' })
		})

		it('a slow but timely answer is fine', async () => {
			const slow: TReply = (res) => {
				setTimeout(() => {
					res.writeHead(200, { 'content-type': 'application/json' })
					res.end(SUCCESS_BODY)
				}, 60)
			}
			const fake = await serve(slow)
			expect(await clientFor(fake, { requestTimeout: 2 }).send(MESSAGE)).to.deep.equal({ name: 'Success' })
		})

		it('a huge requestTimeout does not turn into a 1 ms timeout', async () => {
			const slow: TReply = (res) => {
				setTimeout(() => {
					res.writeHead(200, { 'content-type': 'application/json' })
					res.end(SUCCESS_BODY)
				}, 100)
			}
			const fake = await serve(slow)
			expect(await clientFor(fake, { requestTimeout: 3_000_000 }).send(MESSAGE)).to.deep.equal({ name: 'Success' })
		})

		it('a fraction of a millisecond is one millisecond, not an error', async () => {
			const fake = await serve(replyNever)
			const err = await rejectionOf(clientFor(fake, { requestTimeout: 0.0004 }).send(MESSAGE))
			expect(err.result).to.deep.equal({ name: 'Timeout' })
		})
	})

	describe('network failure', () => {
		it('a reset connection rejects with no result and is not retried', async () => {
			const fake = await serve(replyReset)
			const err = await rejectionOf(clientFor(fake, { numberOfRetries: 3 }).send(MESSAGE))
			expect(err.result).to.equal(undefined)
			expect(err.message).to.equal('SocketLabs send failed: UnknownError')
			expect(fake.requests).to.have.lengthOf(1)
			expect(sleeps).to.deep.equal([])
		})

		it('a refused connection rejects with no result and is not retried', async () => {
			const endpointUrl = await closedPortUrl()
			const err = await rejectionOf(
				createSocketLabsClient({
					serverId: 1,
					apiKey: BEARER_KEY,
					requestTimeout: 5,
					numberOfRetries: 3,
					endpointUrl,
					sleep: (ms) => {
						sleeps.push(ms)
						return Promise.resolve()
					}
				}).send(MESSAGE)
			)
			expect(err.result).to.equal(undefined)
			expect(sleeps).to.deep.equal([])
		})

		it('a body cut off by a reset rejects with no result', async () => {
			const cut: TReply = (res) => {
				res.writeHead(200, { 'content-length': '500' })
				res.write('{"ErrorCode":')
				setTimeout(() => res.socket?.destroy(), 20)
			}
			const fake = await serve(cut)
			const err = await rejectionOf(clientFor(fake, { requestTimeout: 3 }).send(MESSAGE))
			expect(err.result).to.equal(undefined)
		})

		it('a redirect is not followed: no second request, no result, the key goes nowhere else', async () => {
			const target = await startFakeServer(replyWith(200, SUCCESS_BODY))
			try {
				const fake = await serve(replyWith(302, '', { location: target.endpointUrl }))
				const err = await rejectionOf(clientFor(fake, { numberOfRetries: 2 }).send(MESSAGE))
				expect(err.result).to.equal(undefined)
				expect(fake.requests).to.have.lengthOf(1)
				expect(target.requests).to.have.lengthOf(0)
				expect(sleeps).to.deep.equal([])
			} finally {
				await target.close()
			}
		})

		it('a 307 that keeps the method and the body is not followed either', async () => {
			const target = await startFakeServer(replyWith(200, SUCCESS_BODY))
			try {
				const fake = await serve(replyWith(307, '', { location: target.endpointUrl }))
				await rejectionOf(clientFor(fake, { apiKey: PLAIN_KEY }).send(MESSAGE))
				expect(target.requests).to.have.lengthOf(0)
			} finally {
				await target.close()
			}
		})

		it('a key that is no valid header value fails with no request, and the key is in no text', async () => {
			// fetch itself names the whole header value in its TypeError text → the client must drop that error. Bearer form (dot at 20), newline inside
			const badKey = `${'A'.repeat(20)}.SECRET${'x'.repeat(13)}\n${'y'.repeat(20)}`
			expect(badKey).to.have.lengthOf(61)
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			const err = await rejectionOf(clientFor(fake, { apiKey: badKey, numberOfRetries: 2 }).send(MESSAGE))
			expect(err.result).to.equal(undefined)
			expect(fake.requests).to.have.lengthOf(0)
			expect(sleeps).to.deep.equal([])
			for (const text of [err.message, String(err.stack), JSON.stringify(err)]) {
				expect(text).to.not.contain('SECRET')
			}
			expect(err.cause).to.equal(undefined)
		})
	})

	describe('checks before any request', () => {
		const bareMessage = buildBasicMessage({ from: 'a@b.c', to: 'd@e.f', subject: 's', text: 't' })

		for (const [label, options, message, code] of [
			['serverId 0', { serverId: 0 }, MESSAGE, 'AuthenticationValidationFailed'],
			['a fractional serverId', { serverId: 1.5 }, MESSAGE, 'AuthenticationValidationFailed'],
			['an empty key', { apiKey: '' }, MESSAGE, 'AuthenticationValidationFailed'],
			['no subject', {}, { ...bareMessage, subject: '' }, 'MessageValidationEmptySubject'],
			['a bad from address', {}, { ...bareMessage, from: { emailAddress: 'nope' } }, 'EmailAddressValidationInvalidFrom'],
			['no body', {}, { ...bareMessage, textBody: '' }, 'MessageValidationEmptyMessage'],
			['no recipient', {}, { ...bareMessage, to: [] }, 'RecipientValidationNoneInMessage']
		] as const) {
			it(`${label} rejects as ${code} and sends nothing`, async () => {
				const fake = await serve(replyWith(200, SUCCESS_BODY))
				const err = await rejectionOf(clientFor(fake, { numberOfRetries: 3, ...options }).send(message))
				expect(err.result).to.deep.equal({ name: code })
				expect(fake.requests).to.have.lengthOf(0)
				expect(sleeps).to.deep.equal([])
			})
		}

		it('a bad recipient is listed in addressResults', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			const err = await rejectionOf(clientFor(fake).send({ ...bareMessage, to: [{ emailAddress: 'bad' }] }))
			expect(err.result).to.deep.equal({ name: 'RecipientValidationInvalidRecipients' })
			expect(err.addressResults).to.deep.equal([{ emailAddress: 'bad', accepted: false, errorCode: 'InvalidAddress' }])
			expect(fake.requests).to.have.lengthOf(0)
		})

		it('bad credentials are reported before a bad message', async () => {
			const fake = await serve(replyWith(200, SUCCESS_BODY))
			const err = await rejectionOf(clientFor(fake, { serverId: 0 }).send({ ...bareMessage, subject: '' }))
			expect(err.result).to.deep.equal({ name: 'AuthenticationValidationFailed' })
		})
	})

	describe('the key never leaves', () => {
		const KEY_IN_ANSWER = `echoed ${BEARER_KEY}`
		const scenarios: [string, TReply, Partial<ISocketLabsClientOptions>][] = [
			['an API-level failure that echoes the key', replyWith(200, JSON.stringify({ ErrorCode: 'InvalidAuthentication', Message: KEY_IN_ANSWER })), {}],
			['a 503 that echoes the key', replyWith(503, KEY_IN_ANSWER), { numberOfRetries: 1 }],
			['a 401 that echoes the key', replyWith(401, KEY_IN_ANSWER), {}],
			['a timeout', replyNever, { requestTimeout: 0.05 }],
			['a reset', replyReset, {}]
		]
		for (const [label, reply, extra] of scenarios) {
			it(`${label}: no text or field of the rejection holds the key`, async () => {
				const fake = await serve(reply)
				const err = await rejectionOf(clientFor(fake, extra).send(MESSAGE))
				for (const text of [err.message, String(err.stack), JSON.stringify(err), JSON.stringify({ ...err })]) {
					expect(text).to.not.contain(BEARER_KEY)
					expect(text).to.not.contain('b'.repeat(40))
				}
			})
		}
	})

	describe('defaults, no network', () => {
		// fetch replaced → nothing leaves the process. Fresh Response per call, body readable once
		const stubFetch = (...statuses: number[]) => {
			let call = 0
			return sinon.stub(globalThis, 'fetch').callsFake(() => {
				const status = statuses[Math.min(call++, statuses.length - 1)] ?? 200
				return Promise.resolve(new Response(status === 200 ? SUCCESS_BODY : '', { status }))
			})
		}
		const plainClient = (extra: Partial<ISocketLabsClientOptions> = {}) =>
			createSocketLabsClient({ serverId: 4321, apiKey: BEARER_KEY, requestTimeout: 120, numberOfRetries: 0, ...extra })

		it('posts to the SocketLabs Injection API endpoint, with the fixed fetch options', async () => {
			const fetchStub = stubFetch(200)
			await plainClient().send(MESSAGE)
			expect(fetchStub.calledOnce).to.equal(true)
			const [url, init] = fetchStub.firstCall.args
			expect(url).to.equal('https://inject.socketlabs.com/api/v1/email')
			expect(init?.method).to.equal('POST')
			expect(init?.redirect).to.equal('error')
			expect(init?.signal).to.be.instanceOf(AbortSignal)
			expect(init?.headers).to.deep.equal({
				'Content-Type': 'application/json;charset=utf-8',
				Accept: 'application/json',
				'User-Agent': `@axiumine/koa-utils (nodejs ${process.version})`,
				Authorization: `Bearer ${BEARER_KEY}`
			})
			expect(typeof init?.body).to.equal('string')
		})

		it('hands AbortSignal.timeout whole milliseconds, rounded up, capped at the Node timer limit', async () => {
			const timeout = sinon.spy(AbortSignal, 'timeout')
			stubFetch(200)
			for (const seconds of [120, 0.0504, 0.0006, 2.5, 3_000_000, 1e12]) {
				await plainClient({ requestTimeout: seconds }).send(MESSAGE)
			}
			expect(timeout.getCalls().map((call) => call.args[0])).to.deep.equal([120000, 51, 1, 2500, 2147483647, 2147483647])
		})

		it('waits with the default sleep (setTimeout) and the default random (Math.random)', async () => {
			const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
			const random = sinon.stub(Math, 'random').returns(0)
			const fetchStub = stubFetch(503, 200)
			const sending = plainClient({ numberOfRetries: 1 }).send(MESSAGE)
			await clock.tickAsync(999)
			expect(fetchStub.callCount).to.equal(1)
			await clock.tickAsync(1)
			expect(await sending).to.deep.equal({ name: 'Success' })
			expect(fetchStub.callCount).to.equal(2)
			expect(random.called).to.equal(true)
		})

		it('Math.random 0.5 makes the default wait 1.5 s', async () => {
			const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
			sinon.stub(Math, 'random').returns(0.5)
			const fetchStub = stubFetch(503, 200)
			const sending = plainClient({ numberOfRetries: 1 }).send(MESSAGE)
			await clock.tickAsync(1499)
			expect(fetchStub.callCount).to.equal(1)
			await clock.tickAsync(1)
			await sending
			expect(fetchStub.callCount).to.equal(2)
		})
	})
})
