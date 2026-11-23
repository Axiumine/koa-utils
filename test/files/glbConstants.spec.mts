import { expect } from 'chai'

import { GLB_POLICY_DEFAULTS } from '../../dist/files/GLB_POLICY_DEFAULTS.mjs'
import { GLB_REJECT_CODES } from '../../dist/files/GLB_REJECT_CODES.mjs'

describe('files/GLB_REJECT_CODES', () => {
	it('is the closed list of codes', () => {
		expect(GLB_REJECT_CODES).to.deep.equal([
			'GLB_TOO_LARGE',
			'GLB_TRUNCATED',
			'GLB_BAD_MAGIC',
			'GLB_BAD_VERSION',
			'GLB_LENGTH_MISMATCH',
			'GLB_BAD_CHUNKS',
			'GLB_JSON_TOO_LARGE',
			'JSON_INVALID',
			'URI_EXTERNAL',
			'URI_DATA',
			'EXTENSION_FORBIDDEN',
			'EXTENSION_NOT_ALLOWED',
			'LIMIT_EXCEEDED',
			'IMAGE_UNREADABLE',
			'IMAGE_UNSUPPORTED',
			'IMAGE_FORMAT_MISMATCH',
			'IMAGE_DECODE_FAILED',
			'VALIDATOR_ERROR',
			'VALIDATOR_FAILED',
			'MESHOPT_DECODE_FAILED',
			'READ_FAILED',
			'OUTPUT_INVALID'
		])
	})
})

describe('files/GLB_POLICY_DEFAULTS', () => {
	it('pins every default, so a change is a decision', () => {
		const MIB = 1024 * 1024
		expect(GLB_POLICY_DEFAULTS).to.deep.equal({
			maxBytes: 32 * MIB,
			maxJsonBytes: 4 * MIB,
			maxBufferBytes: 128 * MIB,
			maxTriangles: 500_000,
			maxVertices: 1_000_000,
			maxAccessors: 5000,
			maxAccessorElements: 2_000_000,
			maxSparseElements: 100_000,
			maxMeshes: 1000,
			maxNodes: 10_000,
			maxMaterials: 500,
			maxTextures: 100,
			maxAnimations: 100,
			maxTextureSide: 2048,
			maxTexturePixels: 64 * MIB,
			textureQuality: 90,
			allowedExtensions: [
				'KHR_materials_anisotropy',
				'KHR_materials_clearcoat',
				'KHR_materials_dispersion',
				'KHR_materials_emissive_strength',
				'KHR_materials_ior',
				'KHR_materials_iridescence',
				'KHR_materials_sheen',
				'KHR_materials_specular',
				'KHR_materials_transmission',
				'KHR_materials_unlit',
				'KHR_materials_volume',
				'KHR_texture_transform',
				'KHR_mesh_quantization',
				'EXT_meshopt_compression',
				'KHR_texture_basisu',
				'EXT_texture_webp'
			]
		})
	})

	it('has no Draco and no interactivity in the default list', () => {
		expect(GLB_POLICY_DEFAULTS.allowedExtensions).to.not.include('KHR_draco_mesh_compression')
		expect(GLB_POLICY_DEFAULTS.allowedExtensions).to.not.include('KHR_interactivity')
	})
})
