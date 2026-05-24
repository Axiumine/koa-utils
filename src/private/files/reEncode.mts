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
	const parts = filePath.split('.')
	const originalFileExt = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''

	try {

		if (ext === 'jpeg') {
			await sharp(filePath)
				.jpeg({ quality, progressive: true })
				.withMetadata({})
				.withExif({})
				.toFile(finalFilepath)
		} else if (ext === 'png') {
			await sharp(filePath)
				.png({ quality, progressive: true })
				.withMetadata({})
				.withExif({})
				.toFile(finalFilepath)
		} else if (ext === 'webp') {
			await sharp(filePath)
				.webp({ quality, lossless: true })
				.withMetadata({})
				.withExif({})
				.toFile(finalFilepath)
		} else if (ext === 'avif') {
			await sharp(filePath)
				.avif({ quality, lossless: true })
				.withMetadata({})
				.withExif({})
				.toFile(finalFilepath)
		}

	} catch (err) {
		Sentry.captureException(err)
		throw new Error('Error processing the image')
	}

	// unlink if file extension is different
	if (originalFileExt !== ext) {
		try {
			await fs.unlink(filePath)
		} catch (e) {
			Sentry.captureException(e)
			throw throwInternalError()
		}
	}

	return finalFilepath
}
