import { reEncode } from '@private/files/reEncode.mjs'

export async function reEncodeToPng(filename: string, quality = 100) {
	return await reEncode(filename, 'png', quality)
}
