import { reEncode } from '@private/files/reEncode.mjs'

export async function reEncodeToJpeg(filename: string, quality = 100) {
	return await reEncode(filename, 'jpeg', quality)
}
