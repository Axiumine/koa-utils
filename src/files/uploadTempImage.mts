import { IFileUpload } from '../koa/IFileUpload.mjs'
import { IUploadTemp } from './IUploadTemp.mjs'
import { reEncodeToWebp } from './reEncodeToWebp.mjs'
import { scanVirus } from './scanVirus.mjs'
import { storeUploadAsTemp } from './storeUploadAsTemp.mjs'
import { validateJpgPngExtension } from './validateJpgPngExtension.mjs'
import { validateJpgPngMimeType } from './validateMimeTypeImages.mjs'

/**
 * Validate file extension, Mime Type, scan with ClamAV, re encode to webp, rename final file
 * @todo log uploaded file
 * @param img
 */
export async function uploadTemp(img: Promise<IFileUpload>): Promise<IUploadTemp> {
	let storedTempFile = ''

	try {
		// Step 1 - Readme.md
		const { fileName, filePath } = await storeUploadAsTemp(img)
		//console.debug(fileName, filePath)
		await validateJpgPngExtension(fileName, filePath)
		await validateJpgPngMimeType(filePath)
		// step 2
		await scanVirus(`${filePath}`)
		// step 3

		storedTempFile = await reEncodeToWebp(filePath)
		// await checkForNSFW(filePath)
		// step 4 - safe file name (ok)
		// step 5 - rate limit (ok)
		// step 6 - ok
		// step 7 - ok
		// step8 - log
		// user's IP address, filename, and timestamp,
		// @todo await logUpload('team', uId, originalFilename, fileName)
	} catch (e) {
		// error for file handling
		console.error('Error storing image:', e)
		throw new Error('Error storing image')
	}

	return {
		ext: 'webp',
		tempFile: storedTempFile
	}
}
