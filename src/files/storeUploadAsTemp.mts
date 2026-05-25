import { createWriteStream, unlink } from 'node:fs'

import * as Sentry from '@sentry/node'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

import { IFileUpload } from '../koa/IFileUpload.mjs'
import { IStoreFile, UPLOAD_TEMP_DIRECTORY_URL } from './fileConst.mjs'

// Simulating __dirname using process.cwd()
// const __dirname = process.cwd()
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB size limit

export async function storeUploadAsTemp(upload: Promise<IFileUpload>, maxFileSize: number = MAX_FILE_SIZE): Promise<IStoreFile> {
	const { createReadStream, filename } = await upload
	const stream = createReadStream()
	const storedFileName = uuidv4() + path.extname(filename).toLowerCase()
	const storedFileUrl = `${UPLOAD_TEMP_DIRECTORY_URL}/${storedFileName}`
	let fileSize = 0 // Variable to track file size

	// Store the file in the filesystem.
	await new Promise((resolve, reject) => {
		// Create a stream to which the upload will be written.
		const writeStream = createWriteStream(storedFileUrl)

		// Check file size during streaming
		stream.on('data', (chunk: Buffer) => {
			fileSize += chunk.length
			if (fileSize > maxFileSize) {
				writeStream.destroy() // Stop the stream
				unlink(storedFileUrl, () => reject(new Error(`File size exceeds the limit of {maxFileSize}MB`)))
			}
		})

		// Resolve the Promise only once the file handle is fully closed
		writeStream.on('close', () => resolve(undefined))

		// If there's an error writing the file, remove the partially written file
		// and reject the promise.
		/* c8 ignore start -- race-condition error path, not reachable in deterministic tests */
		writeStream.on('error', (e) => {
			unlink(storedFileUrl, (unlinkError) => {
				if (unlinkError) {
					// Log or handle the unlink error in some way
					Sentry.captureException(e, {
						extra: { detail: 'unlink error' }
					})
				}
				reject(new Error('File size exceeds the limit.'))
			})
		})
		/* c8 ignore stop */

		// In Node.js <= v13, errors are not automatically propagated between piped streams. If there is an error receiving the upload, destroy the write stream with the corresponding error.
		stream.on('error', (error: Error) => writeStream.destroy(error))

		// Pipe the upload into the write stream.
		stream.pipe(writeStream)
	})

	//console.debug('storedFileName', storedFileName)

	return {
		originalFilename: filename,
		fileName: storedFileName,
		filePath: storedFileUrl
	}
}
