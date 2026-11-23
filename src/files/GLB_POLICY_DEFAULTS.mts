/**
 * What `sanitiseGlb` accepts. Every field has a safe default in {@link GLB_POLICY_DEFAULTS}; the caller passes only the
 * fields it wants to change. Every limit is a positive integer: a `0`, a negative number, a float or a `NaN` is a
 * programming error and throws.
 */
export interface IGlbPolicy {
	/** Bytes of the whole GLB file. */
	maxBytes: number
	/** Bytes of the JSON chunk. */
	maxJsonBytes: number
	/** Bytes of all buffers as declared in the JSON, plus the decoded size of every `EXT_meshopt_compression` view. */
	maxBufferBytes: number
	/** Triangles, counted once for every node that instances the mesh. */
	maxTriangles: number
	/** Vertices, counted once for every node that instances the mesh. */
	maxVertices: number
	/** Number of accessors. */
	maxAccessors: number
	/** `count` of the biggest single accessor, sparse or not. */
	maxAccessorElements: number
	/** Sum of the `sparse.count` of every accessor. */
	maxSparseElements: number
	/** Number of meshes. */
	maxMeshes: number
	/** Number of nodes. */
	maxNodes: number
	/** Number of materials. */
	maxMaterials: number
	/** Number of textures, and of images. */
	maxTextures: number
	/** Number of animations. */
	maxAnimations: number
	/** Width or height of one image in pixels, read from its header. */
	maxTextureSide: number
	/** Sum of width times height over every image, read from the headers. */
	maxTexturePixels: number
	/** JPEG and WebP quality (1 to 100) used when the textures are re-encoded. PNG is always lossless. */
	textureQuality: number
	/** Extension names the file may declare. Every name must be one the sanitiser can rewrite. */
	allowedExtensions: readonly string[]
}

const MIB = 1024 * 1024

/**
 * The safe defaults of {@link IGlbPolicy}. A caller that wants one more extension spreads the list:
 * `{ allowedExtensions: [...GLB_POLICY_DEFAULTS.allowedExtensions, 'KHR_lights_punctual'] }`.
 *
 * `KHR_draco_mesh_compression` is not in the list: the sanitiser has no Draco decoder, so it could not check the data.
 * `KHR_interactivity` is refused whatever the list says.
 */
export const GLB_POLICY_DEFAULTS: Readonly<IGlbPolicy> = {
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
}
