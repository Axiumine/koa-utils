import { createWriteStream, unlink } from 'node:fs'

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
	let sizeExceeded = false // Set once the limit is passed; read by the 'close' handler
	let writeFailure: Error | null = null // Set on a write/stream error; read by the 'close' handler

	// Store the file in the filesystem.
	await new Promise((resolve, reject) => {
		// Create a stream to which the upload will be written.
		const writeStream = createWriteStream(storedFileUrl)

		// Check file size during streaming.
		// Only flags and stops the stream — the rejection is issued from the 'close'
		// handler below. Rejecting from inside unlink's callback here would lose the
		// race: writeStream.destroy() emits 'close' synchronously ahead of the async
		// unlink, so 'close' resolved the promise first and the later reject() was a
		// no-op on an already-settled promise. An oversize upload therefore reported
		// SUCCESS while returning a path that had just been deleted.
		stream.on('data', (chunk: Buffer) => {
			fileSize += chunk.length
			if (!sizeExceeded && fileSize > maxFileSize) {
				sizeExceeded = true
				writeStream.destroy() // Stop the stream
			}
		})

		// Best-effort cleanup, then reject. Cleanup is fire-and-forget by design: the
		// upload has already failed, and an unlink error must not mask the real cause.
		const removeThenReject = (reason: Error) => unlink(storedFileUrl, () => reject(reason))

		// 'close' is the single settle point. Every failure path below only RECORDS what
		// went wrong and stops the stream; nothing settles the Promise itself. Rejecting
		// from inside an unlink callback instead would lose the race — destroy() emits
		// 'close' ahead of the async unlink, so 'close' settled the Promise first and the
		// later reject() was a no-op. That is why an oversize upload used to report
		// SUCCESS with a filePath that had just been deleted, and why a write error did
		// the same.
		writeStream.on('close', () => {
			if (sizeExceeded) {
				removeThenReject(new Error(`File size exceeds the limit of ${maxFileSize} bytes`))
			} else if (writeFailure !== null) {
				removeThenReject(writeFailure)
			} else {
				resolve(undefined)
			}
		})

		// Record the write error; 'close' follows and does the rejecting. The previous
		// version rejected here with 'File size exceeds the limit.' regardless of the
		// actual cause, which was misleading for every non-size failure — the real error
		// is propagated now.
		writeStream.on('error', (e: Error) => {
			writeFailure = e
		})

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
