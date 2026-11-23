import type { IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import type { IGlbReason, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { checkGlbAccessors, checkGlbBuffers, checkGlbCounts } from './checkGlbCounts.mjs'
import { checkGlbExtensions } from './checkGlbExtensions.mjs'
import { checkGlbGeometry } from './checkGlbGeometry.mjs'
import { checkGlbImages } from './checkGlbImages.mjs'
import { checkGlbUris } from './checkGlbUris.mjs'
import type { IJsonObject } from './jsonAccess.mjs'

/**
 * Every policy check that needs only the parsed JSON and the BIN chunk, run together so the caller sees all the
 * reasons at once. None of them allocates in proportion to a number the file declares. Fills the counts in `stats`.
 */
export function inspectGlbJson(json: IJsonObject, bin: Uint8Array | null, policy: IGlbPolicy, stats: IGlbStats): IGlbReason[] {
	return [
		...checkGlbUris(json),
		...checkGlbExtensions(json, policy.allowedExtensions),
		...checkGlbCounts(json, policy, stats),
		...checkGlbAccessors(json, policy),
		...checkGlbBuffers(json, policy, stats),
		...checkGlbGeometry(json, policy, stats),
		...checkGlbImages(json, bin, policy, stats)
	]
}
