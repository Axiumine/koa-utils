import { GLB_FORBIDDEN_EXTENSIONS, GLB_SUPPORTED_EXTENSIONS } from '@private/glb/glbExtensions.mjs'
import { resolveGlbPolicy } from '@private/glb/resolveGlbPolicy.mjs'
import { expect } from 'chai'

import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from '../../../dist/files/GLB_POLICY_DEFAULTS.mjs'

const LIMIT_KEYS = Object.keys(GLB_POLICY_DEFAULTS).filter(
	(key) => key !== 'allowedExtensions' && key !== 'textureQuality'
) as (keyof IGlbPolicy)[]

const bad = (options: object): unknown => {
	try {
		resolveGlbPolicy(options as Partial<IGlbPolicy>)
	} catch (error) {
		return error
	}
	return undefined
}

describe('private/glb/resolveGlbPolicy', () => {
	it('no options → the defaults, as a copy', () => {
		const policy = resolveGlbPolicy({})
		expect(policy).to.deep.equal(GLB_POLICY_DEFAULTS)
		expect(policy).to.not.equal(GLB_POLICY_DEFAULTS)
	})

	it('options win over the defaults, one field at a time', () => {
		const policy = resolveGlbPolicy({ maxNodes: 7, textureQuality: 55, allowedExtensions: ['KHR_materials_unlit'] })
		expect(policy).to.deep.equal({
			...GLB_POLICY_DEFAULTS,
			maxNodes: 7,
			textureQuality: 55,
			allowedExtensions: ['KHR_materials_unlit']
		})
	})

	it('a field set to undefined keeps its default', () => {
		expect(resolveGlbPolicy({ maxNodes: undefined } as unknown as Partial<IGlbPolicy>)).to.deep.equal(GLB_POLICY_DEFAULTS)
	})

	it('never changes the defaults', () => {
		const before = JSON.stringify(GLB_POLICY_DEFAULTS)
		resolveGlbPolicy({ maxNodes: 1 })
		expect(JSON.stringify(GLB_POLICY_DEFAULTS)).to.equal(before)
	})

	it('knows 15 limits', () => {
		expect(LIMIT_KEYS).to.have.length(15)
	})

	for (const key of LIMIT_KEYS) {
		it(`${key}: accepts 1 and a big integer`, () => {
			expect(resolveGlbPolicy({ [key]: 1 })[key]).to.equal(1)
			expect(resolveGlbPolicy({ [key]: 2 ** 40 })[key]).to.equal(2 ** 40)
		})

		it(`${key}: throws TypeError for 0, a negative, a float, NaN, Infinity or a string`, () => {
			for (const value of [0, -1, 1.5, NaN, Infinity, '5', null, [], 2 ** 53]) {
				const error = bad({ [key]: value })
				expect(error, `${key}=${String(value)}`).to.be.instanceOf(TypeError)
				expect((error as Error).message).to.equal(`sanitiseGlb: option ${key} must be a positive integer`)
			}
		})
	}

	it('textureQuality: 1 to 100 are valid, nothing else', () => {
		expect(resolveGlbPolicy({ textureQuality: 1 }).textureQuality).to.equal(1)
		expect(resolveGlbPolicy({ textureQuality: 100 }).textureQuality).to.equal(100)
		for (const value of [0, 101, -5, 50.5, NaN, '90', null]) {
			const error = bad({ textureQuality: value })
			expect(error, String(value)).to.be.instanceOf(TypeError)
			expect((error as Error).message).to.equal('sanitiseGlb: option textureQuality must be an integer from 1 to 100')
		}
	})

	it('allowedExtensions: an empty list is valid, so is every supported name', () => {
		expect(resolveGlbPolicy({ allowedExtensions: [] }).allowedExtensions).to.deep.equal([])
		expect(resolveGlbPolicy({ allowedExtensions: [...GLB_SUPPORTED_EXTENSIONS] }).allowedExtensions).to.deep.equal(
			GLB_SUPPORTED_EXTENSIONS
		)
	})

	it('allowedExtensions: must be an array', () => {
		for (const value of ['KHR_materials_unlit', null, {}, 5]) {
			const error = bad({ allowedExtensions: value })
			expect(error, String(value)).to.be.instanceOf(TypeError)
			expect((error as Error).message).to.equal('sanitiseGlb: option allowedExtensions must be an array of names')
		}
	})

	it('allowedExtensions: a name the sanitiser cannot rewrite is a RangeError that names it', () => {
		const error = bad({ allowedExtensions: ['KHR_materials_unlit', 'KHR_draco_mesh_compression', 'FOO_bar'] })
		expect(error).to.be.instanceOf(RangeError)
		expect((error as Error).message).to.equal(
			'sanitiseGlb: allowedExtensions holds names the sanitiser cannot rewrite: KHR_draco_mesh_compression, FOO_bar'
		)
	})

	it('allowedExtensions: KHR_interactivity and non-string entries are refused', () => {
		expect(bad({ allowedExtensions: ['KHR_interactivity'] })).to.be.instanceOf(RangeError)
		expect((bad({ allowedExtensions: [5, null] }) as Error).message).to.contain('cannot rewrite: 5, null')
	})

	it('an unknown option is a TypeError that names it', () => {
		const error = bad({ maxTriangle: 5 })
		expect(error).to.be.instanceOf(TypeError)
		expect((error as Error).message).to.equal('sanitiseGlb: unknown option maxTriangle')
		expect(bad({ constructor: 5 })).to.be.instanceOf(TypeError)
		expect(bad({ toString: 5 })).to.be.instanceOf(TypeError)
	})

	it('the extension lists: supported = defaults + lights + variants, interactivity is forbidden', () => {
		expect(GLB_SUPPORTED_EXTENSIONS).to.deep.equal([
			...GLB_POLICY_DEFAULTS.allowedExtensions,
			'KHR_lights_punctual',
			'KHR_materials_variants'
		])
		expect(GLB_FORBIDDEN_EXTENSIONS).to.deep.equal(['KHR_interactivity'])
	})
})
