import { SocketLabsLib } from '../../dist/email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
import * as Sentry from '@sentry/node'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expectGraphQLErrorAsync } from '../helpers/assertGraphQLError.mjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace the private SocketLabsClient instance on a SocketLabsLib object */
function injectClient(lib: SocketLabsLib, sendStub: sinon.SinonStub) {
	;(lib as unknown as { client: { send: sinon.SinonStub } }).client = { send: sendStub }
}

function makeSendStub(resolveWith: unknown = true) {
	return sinon.stub().resolves(resolveWith)
}

function makeSendStubReject(err: Error) {
	return sinon.stub().rejects(err)
}

/** Read back the BasicMessage handed to client.send() — subject/textBody/htmlBody as built */
function sentMessage(sendStub: sinon.SinonStub) {
	const [msg] = sendStub.firstCall.args
	return msg as { subject: string; textBody: string; htmlBody: string }
}

// ---------------------------------------------------------------------------
// Env setup — minimal values → constructor not blow up
// ---------------------------------------------------------------------------

const ORIG_ENV: Record<string, string | undefined> = {}
const ENV_KEYS = [
	'SOCKETLABS_SERVER_ID',
	'SOCKETLABS_SERVER_APIKEY',
	'PLATFORM_NAME',
	'APP_DOMAIN',
	'EMAIL_FROM',
	'DEV_TEAM_EMAIL',
]

before(() => {
	for (const k of ENV_KEYS) {
		ORIG_ENV[k] = process.env[k]
	}
	process.env['SOCKETLABS_SERVER_ID'] = '1234'
	process.env['SOCKETLABS_SERVER_APIKEY'] = 'test-api-key'
	process.env['PLATFORM_NAME'] = 'TestPlatform'
	process.env['APP_DOMAIN'] = 'https://test.example.com'
	process.env['EMAIL_FROM'] = 'no-reply@test.example.com'
	process.env['DEV_TEAM_EMAIL'] = 'dev@test.example.com'
})

after(() => {
	for (const k of ENV_KEYS) {
		if (ORIG_ENV[k] === undefined) {
			delete process.env[k]
		} else {
			process.env[k] = ORIG_ENV[k]
		}
	}
})

// ---------------------------------------------------------------------------
// Constructor / header injection
// ---------------------------------------------------------------------------

describe('SocketLabsLib — constructor', () => {
	it('uses provided htmlHeader1, htmlHeader2, htmlFooter when non-empty', () => {
		const lib = new SocketLabsLib('<h1>', '</h1>', '<footer/>')
		// Construction succeed + methods callable
		expect(lib).to.be.instanceOf(SocketLabsLib)
	})

	it('falls back to built-in headers when all args are empty strings (default)', () => {
		const lib = new SocketLabsLib()
		expect(lib).to.be.instanceOf(SocketLabsLib)
	})
})

// ---------------------------------------------------------------------------
// sendEmailVerify
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendEmailVerify', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('calls client.send once and returns true on success', async () => {
		const result = await lib.sendEmailVerify('user@example.com', 'abc123')
		expect(sendStub.calledOnce).to.equal(true)
		expect(result).to.equal(true)
	})

	it('passes encoded email in the link body', async () => {
		await lib.sendEmailVerify('user+tag@example.com', 'hash1', 'Alice')
		const { textBody, htmlBody } = sentMessage(sendStub)
		expect(sendStub.calledOnce).to.equal(true)
		expect(textBody).to.contain('https://test.example.com/check/verify-email/user+tag@example.com/hash1')
		expect(htmlBody).to.contain('user+tag@example.com/hash1')
	})

	it('handles empty name (default parameter)', async () => {
		const result = await lib.sendEmailVerify('a@b.com', 'h')
		expect(result).to.equal(true)
	})

	it('includes name in body when name is provided', async () => {
		const result = await lib.sendEmailVerify('a@b.com', 'h', 'Giovanni')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects (Sentry path)', async () => {
		sendStub = makeSendStubReject(new Error('network error'))
		injectClient(lib, sendStub)
		const result = await lib.sendEmailVerify('a@b.com', 'h')
		expect(result).to.equal(false)
	})

	it('builds the link on the given linkBase and linkPath when both are supplied', async () => {
		await lib.sendEmailVerify('u@example.com', 'h9', '', 'https://customer.example.com', '/check/verify-email-user')
		const { textBody, htmlBody } = sentMessage(sendStub)
		// Whole point of the 2 params: 1 process, 2 audiences, 2 domains. APP_DOMAIN must not appear.
		expect(textBody).to.contain('https://customer.example.com/check/verify-email-user/u@example.com/h9')
		expect(htmlBody).to.contain('https://customer.example.com/check/verify-email-user/u@example.com/h9')
		expect(textBody).to.not.contain('https://test.example.com')
	})

	it('normalises a trailing slash on linkBase and a missing leading slash on linkPath', async () => {
		await lib.sendEmailVerify('u@example.com', 'h9', '', 'https://customer.example.com//', 'check/verify-email-user')
		const { textBody } = sentMessage(sendStub)
		// Caller give config, not pre-joined URL → `//check` + `example.comcheck` both normalised, no throw.
		expect(textBody).to.contain('https://customer.example.com/check/verify-email-user/u@example.com/h9')
	})

	it('keeps the APP_DOMAIN link when only linkBase is defaulted', async () => {
		await lib.sendEmailVerify('u@example.com', 'h9', '', undefined, '/check/verify-email-user')
		const { textBody } = sentMessage(sendStub)
		// `undefined` trigger default param → this.linkBase. Pin it: every pre-5.8.0 caller rely on it.
		expect(textBody).to.contain('https://test.example.com/check/verify-email-user/u@example.com/h9')
	})
})

// ---------------------------------------------------------------------------
// sendEmailChangeVerify
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendEmailChangeVerify', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.sendEmailChangeVerify('u@x.com', 'hashXYZ')
		expect(result).to.equal(true)
		expect(sendStub.calledOnce).to.equal(true)
	})

	it('handles name parameter', async () => {
		const result = await lib.sendEmailChangeVerify('u@x.com', 'hashXYZ', 'Bob')
		expect(result).to.equal(true)
	})

	it('builds an html body free of leftover concatenation syntax', async () => {
		await lib.sendEmailChangeVerify('u@x.com', 'hashXYZ', 'Bob')
		const { htmlBody } = sentMessage(sendStub)
		expect(htmlBody).to.not.contain(`" +`)
		expect(htmlBody).to.contain('You can confirm the registration by visiting this link')
		expect(htmlBody).to.contain('/check/verify-change-email/u@x.com/hashXYZ')
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendEmailChangeVerify('u@x.com', 'hashXYZ')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendWelcome
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendWelcome', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.sendWelcome('w@x.com')
		expect(result).to.equal(true)
		expect(sendStub.calledOnce).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendWelcome('w@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// accountDisabled
// ---------------------------------------------------------------------------

describe('SocketLabsLib — accountDisabled', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.accountDisabled('d@x.com')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.accountDisabled('d@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// accountBanned
// ---------------------------------------------------------------------------

describe('SocketLabsLib — accountBanned', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.accountBanned('b@x.com')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.accountBanned('b@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// alertDevTeam
// ---------------------------------------------------------------------------

describe('SocketLabsLib — alertDevTeam', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.alertDevTeam('something crashed')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.alertDevTeam('oh no')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// wrongHash
// ---------------------------------------------------------------------------

describe('SocketLabsLib — wrongHash', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('throws InternalError when times > 5', async () => {
		await expectGraphQLErrorAsync(
			() => lib.wrongHash('u@x.com', 6),
			500,
			'Internal Server Error'
		)
	})

	it('sends email and returns true when times <= 5', async () => {
		const result = await lib.wrongHash('u@x.com', 3)
		expect(result).to.equal(true)
		expect(sendStub.calledOnce).to.equal(true)
	})

	it('handles times = 0 (5 remaining)', async () => {
		const result = await lib.wrongHash('u@x.com', 0)
		expect(result).to.equal(true)
	})

	it('handles times = 5 (0 remaining, boundary)', async () => {
		const result = await lib.wrongHash('u@x.com', 5)
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.wrongHash('u@x.com', 2)
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// tooMuchVerifyRequests
// ---------------------------------------------------------------------------

describe('SocketLabsLib — tooMuchVerifyRequests', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.tooMuchVerifyRequests('t@x.com')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.tooMuchVerifyRequests('t@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// hashReqTooOld
// ---------------------------------------------------------------------------

describe('SocketLabsLib — hashReqTooOld', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.hashReqTooOld('h@x.com')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.hashReqTooOld('h@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// emailAlreadyValid
// ---------------------------------------------------------------------------

describe('SocketLabsLib — emailAlreadyValid', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.emailAlreadyValid('e@x.com')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.emailAlreadyValid('e@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendSubscriptionEmail
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendSubscriptionEmail', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.sendSubscriptionEmail('s@x.com', '123456')
		expect(result).to.equal(true)
	})

	it('builds the subject and activation url without stray punctuation', async () => {
		await lib.sendSubscriptionEmail('s@x.com', '123456')
		const { subject, textBody } = sentMessage(sendStub)
		expect(subject).to.equal('Activate your TestPlatform account')
		expect(textBody).to.contain('https://test.example.com/x/emailVerify')
		expect(textBody).to.not.contain(`.com'/`)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendSubscriptionEmail('s@x.com', '123456')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendResetPwdConfirmation
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendResetPwdConfirmation', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success without name', async () => {
		const result = await lib.sendResetPwdConfirmation('r@x.com')
		expect(result).to.equal(true)
	})

	it('returns true on success with name', async () => {
		const result = await lib.sendResetPwdConfirmation('r@x.com', 'Carlo')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendResetPwdConfirmation('r@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendResetPwdConfirmationHash
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendResetPwdConfirmationHash', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.sendResetPwdConfirmationHash('r@x.com', 'Luca', 'hash999')
		expect(result).to.equal(true)
	})

	it('brands the subject with platformName and reuses it in the html header', async () => {
		await lib.sendResetPwdConfirmationHash('r@x.com', 'Luca', 'hash999')
		const { subject, htmlBody } = sentMessage(sendStub)
		expect(subject).to.equal('Password change confirmation for TestPlatform')
		expect(htmlBody).to.contain('<title>Password change confirmation for TestPlatform</title>')
		expect(htmlBody).to.not.contain('YourCompany')
	})

	it('returns false when sendEmail reports failure via the inner rejection handler', async () => {
		// sendEmail resolve false when send() reject — the inner error handler swallow it
		sendStub = makeSendStubReject(new Error('internal'))
		injectClient(lib, sendStub)
		const result = await lib.sendResetPwdConfirmationHash('r@x.com', 'Mario', 'hash1')
		expect(result).to.equal(false)
	})

	it('returns false when sendEmail throws synchronously (catch branch, Sentry path)', async () => {
		// send() throw synchronously → sendEmail Promise reject → try/catch in sendResetPwdConfirmationHash catch it
		const throwingClient = {
			send: () => {
				throw new Error('sync throw')
			},
		}
		;(lib as unknown as { client: unknown }).client = throwingClient
		const result = await lib.sendResetPwdConfirmationHash('r@x.com', 'Luca', 'hashSync')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendEmailReset
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendEmailReset', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success without name', async () => {
		const result = await lib.sendEmailReset('reset@x.com', 'resetHash')
		expect(result).to.equal(true)
	})

	it('returns true on success with name', async () => {
		const result = await lib.sendEmailReset('reset@x.com', 'resetHash', 'Matteo')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendEmailReset('reset@x.com', 'resetHash')
		expect(result).to.equal(false)
	})

	it('builds the link on the given linkBase and linkPath when both are supplied', async () => {
		await lib.sendEmailReset('u@example.com', 'r9', '', 'https://customer.example.com', '/account/new-password')
		const { textBody, htmlBody } = sentMessage(sendStub)
		// Same reason as sendEmailVerify: 1 process, 2 audiences, 2 domains. A customer reset link
		// landing on the operator panel cannot be completed at all. APP_DOMAIN must not appear.
		expect(textBody).to.contain('https://customer.example.com/account/new-password/u@example.com/r9')
		expect(htmlBody).to.contain('https://customer.example.com/account/new-password/u@example.com/r9')
		expect(textBody).to.not.contain('https://test.example.com')
	})

	it('normalises a trailing slash on linkBase and a missing leading slash on linkPath', async () => {
		await lib.sendEmailReset('u@example.com', 'r9', '', 'https://customer.example.com//', 'account/new-password')
		const { textBody } = sentMessage(sendStub)
		// Caller give config, not pre-joined URL → `//account` + `example.comaccount` both normalised, no throw.
		expect(textBody).to.contain('https://customer.example.com/account/new-password/u@example.com/r9')
	})

	it('keeps the APP_DOMAIN link on /x/reset when both are defaulted', async () => {
		await lib.sendEmailReset('u@example.com', 'r9')
		const { textBody } = sentMessage(sendStub)
		// Pin pre-5.9.0 link verbatim: every existing caller pass 2 or 3 args, front-end route already deployed.
		expect(textBody).to.contain('https://test.example.com/x/reset/u@example.com/r9')
	})
})

// ---------------------------------------------------------------------------
// sendOTP
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendOTP', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.sendOTP('otp@x.com', '654321')
		expect(result).to.equal(true)
	})

	it('brands subject and bodies with platformName and carries the otp', async () => {
		await lib.sendOTP('otp@x.com', '654321')
		const { subject, textBody, htmlBody } = sentMessage(sendStub)
		expect(subject).to.equal('OTP code for TestPlatform')
		expect(textBody).to.equal('To confirm your subscription on TestPlatform, enter the following OTP code: 654321')
		expect(htmlBody).to.contain('TestPlatform')
		expect(htmlBody).to.contain('654321')
		expect(htmlBody).to.not.contain('YourCompany')
	})

	it('returns false when sendEmail reports failure via the inner rejection handler', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendOTP('otp@x.com', '654321')
		expect(result).to.equal(false)
	})

	it('returns false when sendEmail throws synchronously (catch branch, Sentry path)', async () => {
		const throwingClient = {
			send: () => {
				throw new Error('sync otp throw')
			},
		}
		;(lib as unknown as { client: unknown }).client = throwingClient
		const result = await lib.sendOTP('otp@x.com', '654321')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendEmailPostReported
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendEmailPostReported', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	const userInfo = {
		_id: 'user123',
		personalData: { name: 'Giovanni', surname: 'Rossi' },
	}

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success with numeric idPost', async () => {
		const result = await lib.sendEmailPostReported(userInfo, 42)
		expect(result).to.equal(true)
	})

	it('returns true on success with string idPost', async () => {
		const result = await lib.sendEmailPostReported(userInfo, 'post-slug')
		expect(result).to.equal(true)
	})

	it('addresses the dev team, not a hard-coded placeholder', async () => {
		await lib.sendEmailPostReported(userInfo, 42)
		const [msg] = sendStub.firstCall.args
		expect((msg as { to: { emailAddress: string }[] }).to).to.deep.equal([{ emailAddress: 'dev@test.example.com' }])
	})

	it('names the reporting user and the post in subject and body', async () => {
		await lib.sendEmailPostReported(userInfo, 42)
		const { subject, textBody, htmlBody } = sentMessage(sendStub)
		expect(subject).to.equal('Post 42 reported')
		expect(textBody).to.equal('Hi, post 42 has been reported by Giovanni Rossi (id: user123).')
		expect(htmlBody).to.contain('reported by Giovanni Rossi (id: user123).')
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendEmailPostReported(userInfo, 99)
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// getHtmlHeader / getHtmlFooter / htmlFooter (public methods)
// ---------------------------------------------------------------------------

describe('SocketLabsLib — getHtmlHeader / getHtmlFooter / htmlFooter', () => {
	let lib: SocketLabsLib

	before(() => {
		lib = new SocketLabsLib()
	})

	it('getHtmlHeader returns a string containing the title', () => {
		const html = lib.getHtmlHeader('My Title')
		expect(html).to.be.a('string')
		expect(html).to.include('My Title')
	})

	it('getHtmlHeader contains DOCTYPE', () => {
		const html = lib.getHtmlHeader('Test')
		expect(html).to.include('DOCTYPE')
	})

	it('getHtmlFooter returns closing tags', () => {
		const html = lib.getHtmlFooter()
		expect(html).to.be.a('string')
		expect(html).to.include('</p></td>')
	})

	it('htmlFooter (public fallback) returns closing tags', () => {
		const html = lib.htmlFooter()
		expect(html).to.be.a('string')
		expect(html).to.include('</p></td>')
	})
})

// ---------------------------------------------------------------------------
// sendEmail error path — sendResetPwdConfirmationHash wrap via try/catch → the rejection handler returning
// false → null already tested above. sendOTP same. Here: sendEmail success resolve path return true
// (via any public method).
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendEmail success resolve path', () => {
	it('resolve callback returns true when send resolves', async () => {
		const lib = new SocketLabsLib()
		const sendStub = sinon.stub().resolves({ result: 'Success' })
		injectClient(lib, sendStub)
		const result = await lib.sendWelcome('ok@x.com')
		expect(result).to.equal(true)
	})
})

// ---------------------------------------------------------------------------
// Exact copy — mutation guard. Each mail: full from / to / subject / textBody / htmlBody pinned.
// Consumer see these strings in inbox → any drift = visible change, not noise.
// ---------------------------------------------------------------------------

const BASE = 'https://test.example.com'
const HEADER1 =
	'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
	'<html lang="en" xmlns="http://www.w3.org/1999/xhtml"> <head>  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />  <title>'
const HEADER2 =
	'</title>  <meta name="viewport" content="width=device-width, initial-scale=1.0"/></head></html>' +
	'<body style="margin: 0; padding: 0;"> <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">  <tr>' +
	'   <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;"><p style="color: #000000; font-family: Verdana, sans-serif; font-size: 12pt;">'
const FOOTER = '</p></td>  </tr> </table></body>'

function titleHeader(title: string) {
	return (
		'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
		'<html xmlns="http://www.w3.org/1999/xhtml"> <head>  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />  <title>' +
		title +
		'</title>  <meta name="viewport" content="width=device-width, initial-scale=1.0"/></head></html>' +
		'<body style="margin: 0; padding: 0;"> <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">  <tr>' +
		'   <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;"><p style="color: #000000; font-family: Verdana, sans-serif; font-size: 12pt;">'
	)
}

function anchor(href: string, text: string = href) {
	return `<a target='_blank' href='${href}'>${text}</a>`
}

type TSent = {
	from: { emailAddress: string; friendlyName: string }
	to: { emailAddress: string }[]
	subject: string
	textBody: string
	htmlBody: string
}

function fullMessage(sendStub: sinon.SinonStub) {
	return sendStub.firstCall.args[0] as TSent
}

describe('SocketLabsLib — exact copy of every mail', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	/** Assert envelope + subject + text + html (html wrapped by default fallback header / footer) */
	function expectMail(to: string, subject: string, textBody: string, htmlBody: string) {
		const msg = fullMessage(sendStub)
		expect(sendStub.calledOnce).to.equal(true)
		expect(msg.from.emailAddress).to.equal('no-reply@test.example.com')
		expect(msg.from.friendlyName).to.equal('TestPlatform')
		expect(msg.to).to.deep.equal([{ emailAddress: to }])
		expect(msg.subject).to.equal(subject)
		expect(msg.textBody).to.equal(textBody)
		expect(msg.htmlBody).to.equal(HEADER1 + subject + HEADER2 + htmlBody + FOOTER)
	}

	it('sendEmailVerify with name', async () => {
		await lib.sendEmailVerify('user@example.com', 'abc123', 'Alice')
		const link = `${BASE}/check/verify-email/user@example.com/abc123`
		expectMail(
			'user@example.com',
			'Confirm your email for TestPlatform',
			'Hi Alice, you or someone else is registering you on TestPlatform.\n' +
				`      You can confirm the registration by copying this link ${link} into your browser. The Team`,
			'Hi Alice,<br>you or someone else is registering you on TestPlatform.<br><br>\n' +
				`      You can confirm the registration by visiting this link ${anchor(link)}<br><br>\n` +
				'      <br><br>The Team'
		)
	})

	it('sendEmailVerify without name → no space, no comma gap', async () => {
		await lib.sendEmailVerify('user@example.com', 'abc123')
		const { textBody, htmlBody } = fullMessage(sendStub)
		expect(textBody.startsWith('Hi, you or someone else is registering you')).to.equal(true)
		expect(htmlBody).to.contain('Hi,<br>you or someone else is registering you')
	})

	it('sendEmailVerify collapses repeated leading slashes of linkPath and trailing slashes of linkBase', async () => {
		await lib.sendEmailVerify('u@example.com', 'h9', '', 'https://customer.example.com///', '///check//verify')
		// Only the edge slashes go → inner `//` stay, `+` quantifier in both regex pinned.
		expect(fullMessage(sendStub).textBody).to.contain('https://customer.example.com/check//verify/u@example.com/h9 into')
	})

	it('sendEmailChangeVerify with and without name', async () => {
		await lib.sendEmailChangeVerify('u@x.com', 'hashXYZ', 'Bob')
		const link = `${BASE}/check/verify-change-email/u@x.com/hashXYZ`
		expectMail(
			'u@x.com',
			'Confirm your email for TestPlatform',
			'Hi Bob, you or someone else has changed the email you sign in with.\n' +
				`      You can confirm by copying this link ${link} into your browser. The Team.`,
			'Hi Bob,<br>you or someone else has changed the email you sign in with.<br><br>\n' +
				`      You can confirm the registration by visiting this link ${anchor(link)}\n` +
				'      <br><br>The Team.'
		)
		sendStub.resetHistory()
		await lib.sendEmailChangeVerify('u@x.com', 'hashXYZ')
		expect(fullMessage(sendStub).textBody.startsWith('Hi, you or someone else has changed')).to.equal(true)
		expect(fullMessage(sendStub).htmlBody).to.contain('Hi,<br>you or someone else has changed')
	})

	it('sendWelcome', async () => {
		await lib.sendWelcome('w@x.com')
		expectMail('w@x.com', 'Welcome to TestPlatform', 'Welcome to TestPlatform', `Welcome to ${anchor(BASE, 'TestPlatform')}`)
	})

	it('accountDisabled', async () => {
		await lib.accountDisabled('d@x.com')
		const text = 'Hi, we are sorry but your account has been disabled. Contact us for more information.'
		expectMail('d@x.com', 'Your account has been disabled', text, `<p>${text}</p>`)
	})

	it('accountBanned', async () => {
		await lib.accountBanned('b@x.com')
		const text = 'Hi, we are sorry but your account has been banned. Contact us for more information.'
		expectMail('b@x.com', 'Your account has been banned', text, `<p>${text}</p>`)
	})

	it('alertDevTeam goes to DEV_TEAM_EMAIL with the error text', async () => {
		await lib.alertDevTeam('boom')
		expectMail('dev@test.example.com', 'TestPlatform error 500', 'error 500 boom', '<p>error 500 <br><br>boom</p>')
	})

	it('wrongHash counts down the remaining attempts (5 - times)', async () => {
		await lib.wrongHash('u@x.com', 3)
		const text = 'Hi, you or someone else is trying to verify your email with a wrong link. You have 2 attempts remaining.'
		expectMail('u@x.com', 'Wrong activation link', text, `<p>${text}</p>`)
		sendStub.resetHistory()
		await lib.wrongHash('u@x.com', 0)
		expect(fullMessage(sendStub).textBody).to.contain('You have 5 attempts remaining.')
	})

	it('tooMuchVerifyRequests', async () => {
		await lib.tooMuchVerifyRequests('t@x.com')
		expectMail(
			't@x.com',
			'Too many attempts to verify your email',
			'Hi, you have made more than 5 attempts to verify your email. You need to repeat the registration request.',
			'<p>Hi, you have made 5 or more attempts to verify your email. You need to repeat the registration request.</p>'
		)
	})

	it('hashReqTooOld', async () => {
		await lib.hashReqTooOld('h@x.com')
		const text =
			'Hi, the activation link you are trying to use is older than 3 days and has expired. You need to repeat the registration request.'
		expectMail('h@x.com', 'Activation link expired', text, `<p>${text}</p>`)
	})

	it('emailAlreadyValid', async () => {
		await lib.emailAlreadyValid('e@x.com')
		const text = 'Hi, your account is already valid, you can log in.'
		expectMail('e@x.com', 'Account already valid', text, `<p>${text}</p>`)
	})

	it('sendSubscriptionEmail', async () => {
		await lib.sendSubscriptionEmail('s@x.com', '123456')
		const url = `${BASE}/x/emailVerify`
		expectMail(
			's@x.com',
			'Activate your TestPlatform account',
			'To confirm your subscription on TestPlatform, open the following link in your browser\n' +
				`     ${url} and enter the following activation code: 123456`,
			`<p>To confirm your subscription on ${anchor(BASE, 'TestPlatform')}, open the following link in your browser\n` +
				`    ${anchor(url)} and enter the following activation code: 123456</p>`
		)
	})

	it('sendResetPwdConfirmation with name', async () => {
		await lib.sendResetPwdConfirmation('r@x.com', 'Carlo')
		expectMail(
			'r@x.com',
			'Password reset for TestPlatform',
			`Hi Carlo, you have confirmed your new password. You can now log in at: ${BASE}. The Team.`,
			'Hi Carlo,<br>you have confirmed your new password.<br><br>You can now log in at:<br>' +
				`${anchor(BASE, 'TestPlatform')}<br><br>The Team.`
		)
	})

	it('sendResetPwdConfirmation without name', async () => {
		await lib.sendResetPwdConfirmation('r@x.com')
		const { textBody, htmlBody } = fullMessage(sendStub)
		expect(textBody.startsWith('Hi, you have confirmed your new password.')).to.equal(true)
		expect(htmlBody).to.contain('Hi,<br>you have confirmed your new password.')
	})

	it('sendResetPwdConfirmationHash', async () => {
		await lib.sendResetPwdConfirmationHash('r@x.com', 'Luca', 'hash999')
		const subject = 'Password change confirmation for TestPlatform'
		const linkReset = `${BASE}/index.php?q=reset&hash=hash999&email=r@x.com`
		expectMail(
			'r@x.com',
			subject,
			`Hi Luca, you have confirmed your new password. You can now log in at: ${BASE} . `,
			titleHeader(subject) +
				'Hi Luca,<br>you have confirmed your new password.<br><br>You can now log in at:<br> ' +
				anchor(linkReset) +
				'<br><br>The Team' +
				FOOTER
		)
	})

	it('sendEmailReset with name', async () => {
		await lib.sendEmailReset('reset@x.com', 'resetHash', 'Matteo')
		const link = `${BASE}/x/reset/reset@x.com/resetHash`
		expectMail(
			'reset@x.com',
			'Password reset for TestPlatform',
			'Hi Matteo, you or someone else has requested a password reset. You can change your login password\n' +
				`      by copying this link ${link} into your browser. The Team.`,
			'Hi Matteo,<br>you or someone else has requested a password reset.<br><br>\n' +
				`      You can change your password by clicking the link:<br>${anchor(link)}\n` +
				'      <br><br>The Team.'
		)
	})

	it('sendEmailReset omitting name entirely → default name is empty', async () => {
		await lib.sendEmailReset('u@example.com', 'r9')
		const { textBody, htmlBody } = fullMessage(sendStub)
		expect(textBody.startsWith('Hi, you or someone else has requested')).to.equal(true)
		expect(htmlBody).to.contain('Hi,<br>you or someone else has requested')
	})

	it('sendEmailReset without name and with repeated edge slashes', async () => {
		await lib.sendEmailReset('u@example.com', 'r9', '', 'https://customer.example.com///', '///account//pwd')
		const { textBody, htmlBody } = fullMessage(sendStub)
		expect(textBody.startsWith('Hi, you or someone else has requested')).to.equal(true)
		expect(htmlBody).to.contain('Hi,<br>you or someone else has requested')
		expect(textBody).to.contain('https://customer.example.com/account//pwd/u@example.com/r9 into')
	})

	it('sendOTP', async () => {
		await lib.sendOTP('otp@x.com', '654321')
		const text = 'To confirm your subscription on TestPlatform, enter the following OTP code: 654321'
		expectMail('otp@x.com', 'OTP code for TestPlatform', text, `<p>${text}</p>`)
	})

	it('sendEmailPostReported', async () => {
		await lib.sendEmailPostReported({ _id: 'user123', personalData: { name: 'Giovanni', surname: 'Rossi' } }, 42)
		const subject = 'Post 42 reported'
		expectMail(
			'dev@test.example.com',
			subject,
			'Hi, post 42 has been reported by Giovanni Rossi (id: user123).',
			titleHeader(subject) + 'Hi, post 42 has been reported by Giovanni Rossi (id: user123).' + FOOTER
		)
	})

	it('getHtmlHeader, getHtmlFooter and htmlFooter return the exact markup', () => {
		expect(lib.getHtmlHeader('T')).to.equal(titleHeader('T'))
		expect(lib.getHtmlFooter()).to.equal(FOOTER)
		expect(lib.htmlFooter()).to.equal(FOOTER)
	})
})

describe('SocketLabsLib — constructor wiring', () => {
	afterEach(() => sinon.restore())

	function clientOf(lib: SocketLabsLib) {
		return (lib as unknown as { client: { serverId: number; apiKey: string; numberOfRetries: number; requestTimeout: number } })
			.client
	}

	it('hands env serverId, api key and retry options to the SocketLabs client', () => {
		const client = clientOf(new SocketLabsLib())
		expect(client.serverId).to.equal(1234)
		expect(client.apiKey).to.equal('test-api-key')
		expect(client.numberOfRetries).to.equal(3)
		expect(client.requestTimeout).to.equal(120)
	})

	it('falls back to serverId 0 when SOCKETLABS_SERVER_ID is unset', () => {
		const saved = process.env['SOCKETLABS_SERVER_ID']
		delete process.env['SOCKETLABS_SERVER_ID']
		try {
			expect(clientOf(new SocketLabsLib()).serverId).to.equal(0)
		} finally {
			process.env['SOCKETLABS_SERVER_ID'] = saved
		}
	})

	it('wraps the body in custom header1, header2 and footer when all three are given', async () => {
		const lib = new SocketLabsLib('<h1>', '</h1>', '<footer/>')
		const stub = makeSendStub(true)
		injectClient(lib, stub)
		await lib.accountDisabled('d@x.com')
		const { subject, htmlBody } = fullMessage(stub)
		expect(htmlBody).to.equal(`<h1>${subject}</h1><p>Hi, we are sorry but your account has been disabled. Contact us for more information.</p><footer/>`)
	})

	it('each of header1, header2 and footer falls back on its own when only the others are given', async () => {
		const stub = makeSendStub(true)
		const onlyH1 = new SocketLabsLib('<h1>')
		injectClient(onlyH1, stub)
		await onlyH1.sendWelcome('w@x.com')
		expect(fullMessage(stub).htmlBody).to.equal('<h1>' + 'Welcome to TestPlatform' + HEADER2 + `Welcome to ${anchor(BASE, 'TestPlatform')}` + FOOTER)

		const stub2 = makeSendStub(true)
		const onlyH2 = new SocketLabsLib('', '</h2>')
		injectClient(onlyH2, stub2)
		await onlyH2.sendWelcome('w@x.com')
		expect(fullMessage(stub2).htmlBody).to.equal(HEADER1 + 'Welcome to TestPlatform' + '</h2>' + `Welcome to ${anchor(BASE, 'TestPlatform')}` + FOOTER)

		const stub3 = makeSendStub(true)
		const onlyFooter = new SocketLabsLib('', '', '<f/>')
		injectClient(onlyFooter, stub3)
		await onlyFooter.sendWelcome('w@x.com')
		expect(fullMessage(stub3).htmlBody).to.equal(HEADER1 + 'Welcome to TestPlatform' + HEADER2 + `Welcome to ${anchor(BASE, 'TestPlatform')}` + '<f/>')
	})

	it('loads .env from the working directory when the module is imported', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'socketlabs-dotenv-'))
		const prevCwd = process.cwd()
		const prevQuiet = process.env['DOTENV_CONFIG_QUIET']
		writeFileSync(join(dir, '.env'), 'SOCKETLABS_MUTATION_MARKER=loaded\n')
		process.env['DOTENV_CONFIG_QUIET'] = 'true'
		try {
			process.chdir(dir)
			// Fresh query string → ESM re-run the module top level → dotenv.config() fire again.
			const url = new URL('../../dist/email/SocketLabsLib.mjs', import.meta.url)
			url.search = '?dotenv=' + Date.now()
			await import(url.href)
			expect(process.env['SOCKETLABS_MUTATION_MARKER']).to.equal('loaded')
		} finally {
			process.chdir(prevCwd)
			rmSync(dir, { recursive: true, force: true })
			delete process.env['SOCKETLABS_MUTATION_MARKER']
			if (prevQuiet === undefined) delete process.env['DOTENV_CONFIG_QUIET']
			else process.env['DOTENV_CONFIG_QUIET'] = prevQuiet
		}
	})
})

describe('SocketLabsLib — Sentry reporting', () => {
	let lib: SocketLabsLib
	let captureStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		// Namespace sealed, scope object not → stub the scope Sentry.captureException delegate to.
		captureStub = sinon.stub(Sentry.getCurrentScope(), 'captureException')
	})

	afterEach(() => sinon.restore())

	it('sendEmail rejection reports the error with the failure detail', async () => {
		const err = new Error('network down')
		injectClient(lib, makeSendStubReject(err))
		expect(await lib.sendWelcome('w@x.com')).to.equal(false)
		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
		expect(captureStub.firstCall.args[1]).to.deep.equal({ captureContext: { extra: { detail: 'Error in sending the email' } } })
	})

	it('sendEmail success reports nothing', async () => {
		injectClient(lib, makeSendStub(true))
		await lib.sendWelcome('w@x.com')
		expect(captureStub.called).to.equal(false)
	})

	it('sendOTP reports a synchronous send failure', async () => {
		const err = new Error('sync otp')
		;(lib as unknown as { client: unknown }).client = {
			send: () => {
				throw err
			}
		}
		expect(await lib.sendOTP('o@x.com', '1')).to.equal(false)
		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
	})

	it('sendResetPwdConfirmationHash reports a synchronous send failure', async () => {
		const err = new Error('sync hash')
		;(lib as unknown as { client: unknown }).client = {
			send: () => {
				throw err
			}
		}
		expect(await lib.sendResetPwdConfirmationHash('r@x.com', 'L', 'h')).to.equal(false)
		expect(captureStub.calledOnce).to.equal(true)
		expect(captureStub.firstCall.args[0]).to.equal(err)
	})
})
