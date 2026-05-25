import { setLoginCookies } from '@lib/setLoginCookies.mjs'
import { refreshTokenOptions } from '@lib/tokenOptions.mjs'
import { REFRESH_TOKEN_EXPIRY } from '@lib/tokens.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

describe('setLoginCookies', () => {
	it('calls ctx.cookies.set with refresh_token and correct options', () => {
		const setCookie = sinon.stub()
		const ctx = {
			cookies: {
				set: setCookie,
				get: sinon.stub()
			}
		}

		setLoginCookies(ctx as never, 'my-refresh-token')

		expect(setCookie.calledOnce).to.equal(true)
		const [key, value, opts] = setCookie.firstCall.args as [string, string, Record<string, unknown>]
		expect(key).to.equal('refresh_token')
		expect(value).to.equal('my-refresh-token')
		expect(opts.httpOnly).to.equal(refreshTokenOptions.httpOnly)
		expect(opts.sameSite).to.equal(refreshTokenOptions.sameSite)
		expect(opts.secure).to.equal(refreshTokenOptions.secure)
		expect(opts.maxAge).to.equal(REFRESH_TOKEN_EXPIRY * 1000)
	})

	it('maxAge equals 90 days in milliseconds', () => {
		const setCookie = sinon.stub()
		const ctx = { cookies: { set: setCookie, get: sinon.stub() } }

		setLoginCookies(ctx as never, 'token')

		const opts = setCookie.firstCall.args[2] as Record<string, unknown>
		expect(opts.maxAge).to.equal(90 * 24 * 60 * 60 * 1000)
	})
})
