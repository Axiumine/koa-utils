import type { IImageSize } from './IImageSize.mjs'

const KTX2_LEVEL_INDEX = 80
const KTX2_LEVEL_BYTES = 24
const KTX2_MAX_LEVELS = 32

/** Every level of the index (64 bit byte offset, then 64 bit byte length) must end inside the file. */
function ktx2LevelsFit(view: DataView, levels: number): boolean {
	const size = BigInt(view.byteLength)
	for (let level = 0; level < levels; level++) {
		const at = KTX2_LEVEL_INDEX + level * KTX2_LEVEL_BYTES
		if (view.getBigUint64(at, true) + view.getBigUint64(at + 8, true) > size) {
			return false
		}
	}
	return true
}

/** Width and height from the KTX2 header, once the level index checks out. Throws when the header is cut short. */
export function readKtx2(view: DataView): IImageSize | null {
	const levels = view.getUint32(40, true)
	if (levels < 1 || levels > KTX2_MAX_LEVELS || !ktx2LevelsFit(view, levels)) {
		return null
	}
	return { width: view.getUint32(20, true), height: view.getUint32(24, true) }
}
