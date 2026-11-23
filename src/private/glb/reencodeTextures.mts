import type { Document } from '@gltf-transform/core'

import type { IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import type { IGlbReason, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { detectImageFormat, type IReencodableFormat } from './readImageHeader.mjs'
import { reEncodeImage } from './reEncodeImage.mjs'

async function tryReEncode(image: Uint8Array, format: IReencodableFormat, policy: IGlbPolicy): Promise<Uint8Array | null> {
	try {
		return await reEncodeImage(image, format, policy.textureQuality, policy.maxTextureSide)
	} catch {
		return null
	}
}

/**
 * Decode and re-encode every PNG, JPEG and WebP texture with `sharp`, and put the new bytes in the document. A texture
 * that does not decode is a reason, never a throw. KTX2 textures (`KHR_texture_basisu`) cannot be decoded here: their
 * header and level index were checked before, and the bytes go through untouched. Counts into `stats.texturesReencoded`.
 */
export async function reencodeTextures(document: Document, policy: IGlbPolicy, stats: IGlbStats): Promise<IGlbReason[]> {
	const reasons: IGlbReason[] = []
	for (const [position, texture] of document.getRoot().listTextures().entries()) {
		const image = texture.getImage() ?? new Uint8Array()
		const format = detectImageFormat(image)
		if (format !== null && format.name === 'ktx2') {
			continue
		}
		const bytes = format === null ? null : await tryReEncode(image, format, policy)
		if (bytes === null) {
			reasons.push({ code: 'IMAGE_DECODE_FAILED', message: `texture ${position} could not be decoded and re-encoded` })
			continue
		}
		texture.setImage(bytes)
		stats.texturesReencoded += 1
	}
	return reasons
}
