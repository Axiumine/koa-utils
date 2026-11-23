import sharp from 'sharp'

import type { IReencodableFormat } from './readImageHeader.mjs'

/**
 * Decode an image with `sharp` and encode it again in the same format. The new file is built from the decoded pixels, so
 * whatever hid in the container (trailing bytes, extra chunks, polyglot payloads) is gone, and `sharp` drops every
 * metadata block (EXIF, XMP, ICC) because nothing asks it to keep one.
 *
 * `reEncode` in `reEncode.mts` is not reused on purpose: it reads and writes files and keeps XMP and ICC (limit L13 in
 * `docs/security.md`), while a GLB texture is a buffer in memory that must come out clean.
 *
 * `limitInputPixels` makes `sharp` refuse an image bigger than `maxSide` squared before it allocates the pixels, a
 * second line behind the header check. `failOn: 'warning'` refuses a truncated or damaged file instead of repairing it.
 */
export async function reEncodeImage(
	bytes: Uint8Array,
	format: IReencodableFormat,
	quality: number,
	maxSide: number
): Promise<Uint8Array> {
	const image = sharp(bytes, { limitInputPixels: maxSide * maxSide, failOn: 'warning' })
	// PNG needs no call: `sharp` writes the format it read, and PNG is lossless.
	if (format.name === 'jpeg') {
		image.jpeg({ quality, progressive: true })
	} else if (format.name === 'webp') {
		image.webp({ quality })
	}
	return new Uint8Array(await image.toBuffer())
}
