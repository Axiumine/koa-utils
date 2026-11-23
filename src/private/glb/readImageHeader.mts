import type { IImageSize } from './IImageSize.mjs'
import { readJpeg } from './readJpegSize.mjs'
import { readKtx2 } from './readKtx2Size.mjs'

interface IImageFormatBase {
	/** The MIME type glTF uses for the format. */
	mime: string
	/** True when the bytes start like this format. */
	matches: (bytes: Uint8Array) => boolean
	/** Width and height from the header. Throws when the header is cut short. */
	read: (view: DataView) => IImageSize | null
}

/** PNG, JPEG and WebP: `sharp` can decode and re-encode them. */
export type IReencodableFormat = IImageFormatBase & { name: 'png' | 'jpeg' | 'webp' }

/** KTX2 (`KHR_texture_basisu`): GPU-compressed, only its header and level index can be checked. */
export type IImageFormat = IReencodableFormat | (IImageFormatBase & { name: 'ktx2' })

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]
const JPEG_START = [0xff, 0xd8, 0xff]

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0): boolean =>
	prefix.every((byte, index) => bytes[at + index] === byte)

const MAX_SIDE = 0x7f_ff_ff_ff

function readPng(view: DataView): IImageSize | null {
	// the first chunk must be IHDR, 13 bytes: this also turns away the "fried" iPhone variant that starts with CgBI
	if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49_48_44_52) {
		return null
	}
	return { width: view.getUint32(16), height: view.getUint32(20) }
}

function readWebp(view: DataView): IImageSize | null {
	const chunk = view.getUint32(12)
	if (chunk === 0x56_50_38_20) {
		// 'VP8 ': lossy, 14 bit sizes behind the 3 byte start code
		return view.getUint32(23) >>> 8 === 0x9d_01_2a
			? { width: view.getUint16(26, true) & 0x3f_ff, height: view.getUint16(28, true) & 0x3f_ff }
			: null
	}
	if (chunk === 0x56_50_38_4c) {
		// 'VP8L': lossless, two 14 bit sizes minus one in one 28 bit field
		const bits = view.getUint32(21, true)
		return view.getUint8(20) === 0x2f ? { width: (bits & 0x3f_ff) + 1, height: ((bits >>> 14) & 0x3f_ff) + 1 } : null
	}
	if (chunk === 0x56_50_38_58) {
		// 'VP8X': extended, two 24 bit sizes minus one
		return {
			width: (view.getUint16(24, true) | (view.getUint8(26) << 16)) + 1,
			height: (view.getUint16(27, true) | (view.getUint8(29) << 16)) + 1
		}
	}
	return null
}

const FORMATS: readonly IImageFormat[] = [
	{ name: 'png', mime: 'image/png', matches: (bytes) => startsWith(bytes, PNG_SIGNATURE), read: readPng },
	{ name: 'jpeg', mime: 'image/jpeg', matches: (bytes) => startsWith(bytes, JPEG_START), read: readJpeg },
	{
		name: 'webp',
		mime: 'image/webp',
		matches: (bytes) => startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8),
		read: readWebp
	},
	{ name: 'ktx2', mime: 'image/ktx2', matches: (bytes) => startsWith(bytes, KTX2_IDENTIFIER), read: readKtx2 }
]

/** The format of the bytes, by magic number. The `mimeType` the file claims is not used. */
export function detectImageFormat(bytes: Uint8Array): IImageFormat | null {
	return FORMATS.find((format) => format.matches(bytes)) ?? null
}

/**
 * Width and height from the header only, nothing is decoded. `null` when the header is cut short, malformed, or
 * reports a side of `0`. Nothing here throws on hostile bytes: reads past the end become `null`.
 */
export function readImageSize(format: IImageFormat, bytes: Uint8Array): IImageSize | null {
	let size: IImageSize | null
	try {
		size = format.read(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength))
	} catch {
		return null
	}
	return size !== null && size.width > 0 && size.height > 0 && size.width <= MAX_SIDE && size.height <= MAX_SIDE ? size : null
}
