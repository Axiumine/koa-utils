import { IFileUpload } from '../koa/IFileUpload.mjs'
import { IUploadTemp } from './IUploadTemp.mjs'
import { scanVirus } from './scanVirus.mjs'
import { storeUploadAsTemp } from './storeUploadAsTemp.mjs'
import { validateMimeTypePdf } from './validateMimeTypePdf.mjs'
import { validatePdfExtension } from './validatePdfExtension.mjs'

/**
 * Validate file extension, Mime Type, scan with ClamAV, re encode to pdf, rename final file
 * @todo log uploaded file, reencode pdf
 * @param pdf
 */
export async function uploadTempPdf(pdf: Promise<IFileUpload>): Promise<IUploadTemp> {
	let storedTempFile = ''

	try {
		// Step 1 - Readme.md
		const { fileName, filePath } = await storeUploadAsTemp(pdf)
		//console.log(fileName, filePath)
		await validatePdfExtension(fileName, filePath)
		await validateMimeTypePdf(filePath)
		// step 2
		await scanVirus(`${filePath}`)
		// step 3

		// @todo reencode with dangerzone https://github.com/freedomofpress/dangerzone/tree/main
		storedTempFile = filePath
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
		console.error('Error storing pdf:', e)
		throw new Error('Error storing pdf')
	}

	return {
		ext: 'pdf',
		tempFile: storedTempFile
	}
}
