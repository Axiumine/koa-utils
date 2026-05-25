import { customFormatErrorFn } from '../../dist/koa/customFormatErrorFn.mjs'
import { expect } from 'chai'
import { GraphQLError } from 'graphql'

describe('customFormatErrorFn', () => {
	it('re-throws GraphQLError preserving message + extensions (does not return)', () => {
		const original = new GraphQLError('Boom', {
			extensions: { http: { status: 418 }, description: 'tea' }
		})
		let caught: unknown
		try {
			customFormatErrorFn(original)
		} catch (e) {
			caught = e
		}
		expect(caught).to.be.instanceOf(GraphQLError)
		const e = caught as GraphQLError
		expect(e.message).to.equal('Boom')
		expect(e.extensions).to.deep.equal({ http: { status: 418 }, description: 'tea' })
		expect(e).to.not.equal(original)
	})

	it('returns plain Error unchanged (does not throw)', () => {
		const e = new Error('plain')
		const out = customFormatErrorFn(e)
		expect(out).to.equal(e)
	})
})
