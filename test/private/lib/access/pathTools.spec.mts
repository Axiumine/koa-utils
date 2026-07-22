/**
 * Tests for private/lib/access/pathTools.mts
 *
 * Three one-liners that every access flow depends on. readPath must answer "absent" rather than throw
 * on a broken path, because the callers' guards are all `typeof x === 'undefined'` checks; buildUnset
 * must pass the caller's list through untouched; buildProjection must never drop _id.
 */
import { buildProjection, buildUnset, readPath } from '../../../../dist/private/lib/access/pathTools.mjs'
import { expect } from 'chai'

describe('readPath', () => {
	it('reads a single-segment path', () => {
		expect(readPath({ email: 'a@b.c' }, 'email')).to.equal('a@b.c')
	})

	it('walks a dotted path', () => {
		expect(readPath({ account: { email: { hash: 'h' } } }, 'account.email.hash')).to.equal('h')
	})

	it('returns undefined when a link is missing', () => {
		expect(readPath({ account: {} }, 'account.email.hash')).to.equal(undefined)
	})

	it('returns undefined when a link is null instead of throwing', () => {
		expect(readPath({ account: null }, 'account.email.hash')).to.equal(undefined)
	})

	it('returns undefined when a link is a primitive instead of throwing', () => {
		expect(readPath({ account: 'nope' }, 'account.email.hash')).to.equal(undefined)
	})

	it('returns undefined for a null or undefined source', () => {
		expect(readPath(null, 'account')).to.equal(undefined)
		expect(readPath(undefined, 'account')).to.equal(undefined)
	})

	it('preserves falsy stored values instead of reporting them absent', () => {
		expect(readPath({ account: { disabled: false } }, 'account.disabled')).to.equal(false)
		expect(readPath({ account: { requestTimes: 0 } }, 'account.requestTimes')).to.equal(0)
	})

	it('preserves object values, so a container path reads as the container', () => {
		const req = { resetDateReq: new Date(0), resetHash: 'h' }
		expect(readPath({ resetPwd: req }, 'resetPwd')).to.deep.equal(req)
	})
})

describe('buildUnset', () => {
	it('maps every path to the empty string mongo expects', () => {
		expect(buildUnset(['a.b', 'c'])).to.deep.equal({ 'a.b': '', c: '' })
	})

	it('accepts a single container path — the strict-subdocument layout', () => {
		expect(buildUnset(['resetPwd'])).to.deep.equal({ resetPwd: '' })
	})

	it('returns an empty payload for an empty list', () => {
		expect(buildUnset([])).to.deep.equal({})
	})
})

describe('buildProjection', () => {
	it('always prefixes _id', () => {
		expect(buildProjection(['account.email.hash'])).to.equal('_id account.email.hash')
	})

	it('joins the paths in the order given', () => {
		expect(buildProjection(['a', 'b', 'c'])).to.equal('_id a b c')
	})

	it('with no paths projects _id alone', () => {
		expect(buildProjection([])).to.equal('_id')
	})
})
