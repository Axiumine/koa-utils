import * as Sentry from '@sentry/node'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import { promises as fs } from 'fs'
import sharp, { FormatEnum } from 'sharp'

type AvailableFormatInf = 'jpeg' | 'png' | 'webp' | 'avif'

/**
 * Re-encode the image to a specific format and remove all metadata (EXIF, etc.)
 * @param filePath
 * @param ext
 * @param quality
 */
export async function reEncode(filePath: string, ext: keyof FormatEnum | AvailableFormatInf, quality = 100) {
	const finalFilepath = filePath.replace(/\.[^.]+$/, `.${ext}`)

	try {
		// Read the bytes up front: sharp refuses to use one file as both input and output, which is
		// exactly what happens when the source already carries the target extension.
		const input = await fs.readFile(filePath)

		if (ext === 'jpeg') {
			await sharp(input).jpeg({ quality, progressive: true }).withMetadata({}).withExif({}).toFile(finalFilepath)
		} else if (ext === 'png') {
			await sharp(input).png({ quality, progressive: true }).withMetadata({}).withExif({}).toFile(finalFilepath)
		} else if (ext === 'webp') {
			await sharp(input).webp({ quality, lossless: true }).withMetadata({}).withExif({}).toFile(finalFilepath)
		} else if (ext === 'avif') {
			await sharp(input).avif({ quality, lossless: true }).withMetadata({}).withExif({}).toFile(finalFilepath)
		}
	} catch (err) {
		Sentry.captureException(err)
		throw new Error('Error processing the image')
	}

	// unlink the original only when the re-encoded image landed on a different path — comparing
	// extensions instead would delete the file just written whenever the two paths coincide
	if (finalFilepath !== filePath) {
		try {
			await fs.unlink(filePath)
		} catch (e) {
			Sentry.captureException(e)
			throw throwInternalError()
		}
	}

	return finalFilepath
}
