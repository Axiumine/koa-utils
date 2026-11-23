import type { IGlbPolicy } from './GLB_POLICY_DEFAULTS.mjs'
import type { IGlbRejectCode } from './GLB_REJECT_CODES.mjs'

/** A name in {@link IGlbPolicy} that holds a limit (every field but the quality and the extension list). */
export type IGlbLimitName = Exclude<keyof IGlbPolicy, 'allowedExtensions' | 'textureQuality'>

/** One reason a file was rejected. */
export interface IGlbReason {
	/** Machine code, one of `GLB_REJECT_CODES`. */
	code: IGlbRejectCode
	/** English text for a log. The wording can change in a patch release, so do not match on it. */
	message: string
	/** JSON pointer into the glTF JSON when the reason points at one object, for example `/images/0`. */
	pointer?: string
	/** Set for `LIMIT_EXCEEDED`: the name of the limit that was hit. */
	limit?: IGlbLimitName
}

/**
 * What was measured. A number is `0` for a stage the file never reached, so a file rejected in the container check has
 * only `inputBytes` set.
 */
export interface IGlbStats {
	/** Size of the uploaded file. */
	inputBytes: number
	/** Size of the sanitised file, `0` when the file was rejected. */
	outputBytes: number
	nodes: number
	meshes: number
	materials: number
	textures: number
	animations: number
	accessors: number
	/** Triangles, counted once for every node that instances the mesh. */
	triangles: number
	/** Vertices, counted once for every node that instances the mesh. */
	vertices: number
	/** Declared buffer bytes plus the decoded size of the `EXT_meshopt_compression` views. */
	bufferBytes: number
	/** Longest side in pixels over all images, read from the headers. */
	maxTextureSide: number
	/** Textures that were decoded and re-encoded by `sharp`. */
	texturesReencoded: number
}

/** The file passed every check and `glb` is the freshly written file. `reasons` is empty. */
export interface IGlbAccepted {
	accepted: true
	glb: Uint8Array
	reasons: []
	stats: IGlbStats
}

/** The file failed at least one check. `reasons` is never empty. */
export interface IGlbRejected {
	accepted: false
	reasons: IGlbReason[]
	stats: IGlbStats
}

/** Result of `sanitiseGlb`. A hostile file gives `accepted: false`, never a thrown error. */
export type IGlbSanitiseResult = IGlbAccepted | IGlbRejected
