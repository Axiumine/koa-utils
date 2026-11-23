import type { IGlbReason, IGlbRejected, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { MAX_REASONS } from './glbReason.mjs'

/** A stats object for a file of `inputBytes`, everything else `0` until a stage measures it. */
export const emptyStats = (inputBytes: number): IGlbStats => ({
	inputBytes,
	outputBytes: 0,
	nodes: 0,
	meshes: 0,
	materials: 0,
	textures: 0,
	animations: 0,
	accessors: 0,
	triangles: 0,
	vertices: 0,
	bufferBytes: 0,
	maxTextureSide: 0,
	texturesReencoded: 0
})

/** The rejected result: at most `MAX_REASONS` reasons, so a hostile file cannot make the result as big as itself. */
export const rejected = (reasons: IGlbReason[], stats: IGlbStats): IGlbRejected => ({
	accepted: false,
	reasons: reasons.slice(0, MAX_REASONS),
	stats
})
