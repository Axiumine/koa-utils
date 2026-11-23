import type { IImageSize } from './IImageSize.mjs'

const isStartOfFrame = (marker: number): boolean =>
	marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
const hasNoLength = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)

/** Width and height from the first start-of-frame segment. Throws when the file is cut short. */
export function readJpeg(view: DataView): IImageSize | null {
	let offset = 2
	while (offset < view.byteLength) {
		const marker = view.getUint8(offset + 1)
		if (view.getUint8(offset) !== 0xff || marker === 0xd9) {
			return null
		}
		if (marker === 0xff) {
			offset += 1
		} else if (hasNoLength(marker)) {
			offset += 2
		} else if (isStartOfFrame(marker)) {
			return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
		} else {
			// a length under 2 lands inside the length field itself, which is never 0xff, so the next pass ends the walk
			offset += 2 + view.getUint16(offset + 2)
		}
	}
	return null
}
