import type { IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import type { IGlbReason, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { limitReasons } from './glbReason.mjs'
import type { IImageSize } from './IImageSize.mjs'
import { countOf, field, type IJsonObject, itemOf, listOf } from './jsonAccess.mjs'
import { detectImageFormat, readImageSize } from './readImageHeader.mjs'

interface IInspected {
	size: IImageSize | null
	reasons: IGlbReason[]
}

const problem = (
	code: 'IMAGE_UNREADABLE' | 'IMAGE_UNSUPPORTED' | 'IMAGE_FORMAT_MISMATCH',
	index: number,
	message: string
): IInspected => ({
	size: null,
	reasons: [{ code, pointer: `/images/${index}`, message: `images[${index}] ${message}` }]
})

/** The bytes of an image inside the BIN chunk, or `null` when the buffer view is missing, empty or outside the chunk. */
function imageBytes(image: IJsonObject, views: unknown[], bin: Uint8Array | null): Uint8Array | null {
	if (bin === null) {
		return null
	}
	const view = itemOf(views, field(image, 'bufferView'))
	const start = countOf(field(view, 'byteOffset'))
	const end = start + countOf(field(view, 'byteLength'))
	return countOf(field(view, 'buffer')) === 0 && end > start && end <= bin.length ? bin.subarray(start, end) : null
}

function inspectImage(image: IJsonObject, index: number, views: unknown[], bin: Uint8Array | null): IInspected {
	const bytes = imageBytes(image, views, bin)
	if (bytes === null) {
		return problem('IMAGE_UNREADABLE', index, 'has no bytes inside the BIN chunk')
	}
	const format = detectImageFormat(bytes)
	if (format === null) {
		return problem('IMAGE_UNSUPPORTED', index, 'is not PNG, JPEG, WebP or KTX2')
	}
	if (typeof field(image, 'mimeType') === 'string' && field(image, 'mimeType') !== format.mime) {
		return problem('IMAGE_FORMAT_MISMATCH', index, `says ${String(field(image, 'mimeType'))} but the bytes are ${format.mime}`)
	}
	const size = readImageSize(format, bytes)
	return size === null ? problem('IMAGE_UNREADABLE', index, 'has a header that cannot be read') : { size, reasons: [] }
}

/**
 * Read the size of every embedded image from its header, before anything decodes it, and check it against
 * `maxTextureSide` and `maxTexturePixels`. A header can claim 100 000 by 100 000 pixels in a few dozen bytes: that is the
 * texture bomb. The format comes from the magic number, not from the `mimeType` the file claims. Images that carry a `uri`
 * are left to the URI check. Fills `stats.maxTextureSide`.
 */
export function checkGlbImages(json: IJsonObject, bin: Uint8Array | null, policy: IGlbPolicy, stats: IGlbStats): IGlbReason[] {
	const views = listOf(field(json, 'bufferViews'))
	const reasons: IGlbReason[] = []
	let pixels = 0
	const images = listOf(field(json, 'images'))
	images.forEach((_item, index) => {
		const image = itemOf(images, index)
		if (field(image, 'uri') !== undefined) {
			return
		}
		const { size, reasons: own } = inspectImage(image, index, views, bin)
		reasons.push(...own)
		if (size !== null) {
			const side = Math.max(size.width, size.height)
			stats.maxTextureSide = Math.max(stats.maxTextureSide, side)
			pixels += size.width * size.height
			reasons.push(...limitReasons('maxTextureSide', `images[${index}]`, side, policy.maxTextureSide))
		}
	})
	return [...reasons, ...limitReasons('maxTexturePixels', 'the images together', pixels, policy.maxTexturePixels)]
}
