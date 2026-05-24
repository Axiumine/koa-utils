import { reEncode } from '@private/files/reEncode.mjs'

export async function reEncodeToWebp(filename: string, quality = 100) {
	return await reEncode(filename, 'webp', quality)
}
