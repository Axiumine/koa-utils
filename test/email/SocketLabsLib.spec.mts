import { SocketLabsLib } from '../../dist/email/SocketLabsLib.mjs'
import { expect } from 'chai'
import sinon from 'sinon'
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
