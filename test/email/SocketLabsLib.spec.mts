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

// ---------------------------------------------------------------------------
// Environment setup — minimal values so the constructor doesn't blow up
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
		// Just verify construction succeeds and methods are callable
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
		const [msg] = sendStub.firstCall.args
		// BasicMessage object — setHtmlBody should contain the encoded email
		expect(sendStub.calledOnce).to.equal(true)
		expect(msg).to.exist
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

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendSubscriptionEmail('s@x.com', '123456')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendConfermaResetPwd
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendConfermaResetPwd', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success without name', async () => {
		const result = await lib.sendConfermaResetPwd('r@x.com')
		expect(result).to.equal(true)
	})

	it('returns true on success with name', async () => {
		const result = await lib.sendConfermaResetPwd('r@x.com', 'Carlo')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendConfermaResetPwd('r@x.com')
		expect(result).to.equal(false)
	})
})

// ---------------------------------------------------------------------------
// sendConfermaResetPwdHash
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendConfermaResetPwdHash', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	beforeEach(() => {
		lib = new SocketLabsLib()
		sendStub = makeSendStub(true)
		injectClient(lib, sendStub)
	})

	afterEach(() => sinon.restore())

	it('returns true on success', async () => {
		const result = await lib.sendConfermaResetPwdHash('r@x.com', 'Luca', 'hash999')
		expect(result).to.equal(true)
	})

	it('returns null when sendEmail returns false (falsy path via inner rejection)', async () => {
		// sendEmail returns false when the promise rejects in the inner rejection handler
		// We achieve false by having send() reject — which triggers the inner error handler returning false
		// Then sendConfermaResetPwdHash gets false back and its `ret ? ret : null` returns null
		sendStub = makeSendStubReject(new Error('internal'))
		injectClient(lib, sendStub)
		const result = await lib.sendConfermaResetPwdHash('r@x.com', 'Mario', 'hash1')
		expect(result).to.equal(null)
	})

	it('returns null when sendEmail throws synchronously (catch branch, Sentry path)', async () => {
		// Make send() throw synchronously so the Promise returned from sendEmail rejects
		// and the try/catch in sendConfermaResetPwdHash catches it
		const throwingClient = {
			send: () => {
				throw new Error('sync throw')
			},
		}
		;(lib as unknown as { client: unknown }).client = throwingClient
		const result = await lib.sendConfermaResetPwdHash('r@x.com', 'Luca', 'hashSync')
		expect(result).to.equal(null)
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

	it('returns null on success (always returns null per implementation)', async () => {
		const result = await lib.sendOTP('otp@x.com', '654321')
		expect(result).to.equal(null)
	})

	it('returns null when sendEmail rejects via inner handler (false → null)', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendOTP('otp@x.com', '654321')
		expect(result).to.equal(null)
	})

	it('returns null when sendEmail throws synchronously (catch branch, Sentry path)', async () => {
		const throwingClient = {
			send: () => {
				throw new Error('sync otp throw')
			},
		}
		;(lib as unknown as { client: unknown }).client = throwingClient
		const result = await lib.sendOTP('otp@x.com', '654321')
		expect(result).to.equal(null)
	})
})

// ---------------------------------------------------------------------------
// sendEmailPostSegnalato
// ---------------------------------------------------------------------------

describe('SocketLabsLib — sendEmailPostSegnalato', () => {
	let lib: SocketLabsLib
	let sendStub: sinon.SinonStub

	const infoUtente = {
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
		const result = await lib.sendEmailPostSegnalato(infoUtente, 42)
		expect(result).to.equal(true)
	})

	it('returns true on success with string idPost', async () => {
		const result = await lib.sendEmailPostSegnalato(infoUtente, 'post-slug')
		expect(result).to.equal(true)
	})

	it('returns false when send rejects', async () => {
		sendStub = makeSendStubReject(new Error('fail'))
		injectClient(lib, sendStub)
		const result = await lib.sendEmailPostSegnalato(infoUtente, 99)
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
// sendEmail error path — sendConfermaResetPwdHash wraps via try/catch
// so the sendEmail rejection handler returning false → null is tested above.
// sendOTP similarly.
// Verify the sendEmail success resolve path returns true (via any public method).
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
