import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { roleFailureSubject } from '@private/lib/PostgreSQL/roleFailureSubject.mjs'
import { expect } from 'chai'

describe('roleFailureSubject', () => {
	it('is the closed reason of a connect error, as the code', () => {
		expect(roleFailureSubject(new DbConnectError('CONNECT_TIMEOUT'))).to.deep.equal({ code: 'CONNECT_TIMEOUT' })
		expect(roleFailureSubject(new DbConnectError('TIMEZONE_NOT_UTC'))).to.deep.equal({ code: 'TIMEZONE_NOT_UTC' })
	})

	it('prefers the reason of a connect error to the code it carries', () => {
		expect(roleFailureSubject(new DbConnectError('CONNECT_FAILED', 'ECONNREFUSED'))).to.deep.equal({ code: 'CONNECT_FAILED' })
	})

	it('is the code of any other object when the code is a string, unchecked: the error class checks it', () => {
		expect(roleFailureSubject(Object.assign(new Error('x'), { code: '42501' }))).to.deep.equal({ code: '42501' })
		expect(roleFailureSubject({ code: 'a sentence with spaces' })).to.deep.equal({ code: 'a sentence with spaces' })
	})

	it('is an empty subject, with no code key at all, for everything else', () => {
		const values = [
			new Error('no code'),
			{ code: 12 },
			{ code: undefined },
			{ code: null },
			{},
			null,
			undefined,
			'a string',
			7,
			true
		]
		for (const value of values) {
			const subject = roleFailureSubject(value)
			expect(subject).to.deep.equal({})
			expect(Object.keys(subject)).to.have.length(0)
		}
	})
})
