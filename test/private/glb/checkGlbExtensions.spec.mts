import { checkGlbExtensions } from '@private/glb/checkGlbExtensions.mjs'
import { expect } from 'chai'

const ALLOWED = ['KHR_materials_unlit', 'KHR_texture_transform']

describe('private/glb/checkGlbExtensions', () => {
	it('accepts a file that declares nothing', () => {
		expect(checkGlbExtensions({}, ALLOWED)).to.deep.equal([])
	})

	it('accepts declared extensions that are on the list', () => {
		expect(
			checkGlbExtensions({ extensionsUsed: ['KHR_materials_unlit'], extensionsRequired: ['KHR_texture_transform'] }, ALLOWED)
		).to.deep.equal([])
	})

	it('rejects an extension that is not on the list, used or required', () => {
		expect(checkGlbExtensions({ extensionsUsed: ['FOO_bar'], extensionsRequired: ['BAZ_qux'] }, ALLOWED)).to.deep.equal([
			{ code: 'EXTENSION_NOT_ALLOWED', message: 'FOO_bar is not in allowedExtensions' },
			{ code: 'EXTENSION_NOT_ALLOWED', message: 'BAZ_qux is not in allowedExtensions' }
		])
	})

	it('rejects an extension that only shows as a key of the root extensions', () => {
		expect(checkGlbExtensions({ extensions: { FOO_bar: {} } }, ALLOWED)).to.deep.equal([
			{ code: 'EXTENSION_NOT_ALLOWED', message: 'FOO_bar is not in allowedExtensions' }
		])
	})

	it('KHR_interactivity has its own code', () => {
		expect(
			checkGlbExtensions({ extensionsUsed: ['KHR_interactivity'], extensions: { KHR_interactivity: { graphs: [] } } }, ALLOWED)
		).to.deep.equal([{ code: 'EXTENSION_FORBIDDEN', message: 'KHR_interactivity is never allowed' }])
	})

	it('KHR_interactivity stays forbidden even when the caller lists it', () => {
		expect(checkGlbExtensions({ extensionsRequired: ['KHR_interactivity'] }, ['KHR_interactivity'])[0]?.code).to.equal(
			'EXTENSION_FORBIDDEN'
		)
	})

	it('gives one reason per name, however often it is declared', () => {
		const json = { extensionsUsed: ['FOO_bar'], extensionsRequired: ['FOO_bar'], extensions: { FOO_bar: {} } }
		expect(checkGlbExtensions(json, ALLOWED)).to.have.length(1)
	})

	it('names that are not strings are not allowed', () => {
		expect(checkGlbExtensions({ extensionsUsed: [123, null] }, ALLOWED).map((reason) => reason.message)).to.deep.equal([
			'123 is not in allowedExtensions',
			'null is not in allowedExtensions'
		])
	})

	it('ignores declarations that are not arrays', () => {
		expect(
			checkGlbExtensions({ extensionsUsed: 'FOO_bar', extensionsRequired: { a: 1 }, extensions: 'x' }, ALLOWED)
		).to.deep.equal([])
	})
})
