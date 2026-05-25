import { expect } from 'chai'
import { EventEmitter } from 'events'
import { createReadStream, unlinkSync, existsSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import os from 'os'
import path from 'path'

// storeUploadAsTemp writes to /tmp (UPLOAD_TEMP_DIRECTORY_URL = '/tmp').
// We use real streams and real /tmp — clean up in afterEach.

const createdFiles: string[] = []

function makeUploadFromBuffer(buf: Buffer, filename: string) {
	// Write to a real temp file so createReadStream works
	const srcPath = path.join(os.tmpdir(), `test-src-${Date.now()}.bin`)
	writeFileSync(srcPath, buf)
	createdFiles.push(srcPath)
	return Promise.resolve({
		createReadStream: () => createReadStream(srcPath),
		filename,
		mimetype: 'image/jpeg',
		encoding: '7bit'
	})
}

function makeUploadFromStream(readStream: NodeJS.ReadableStream, filename: string) {
	return Promise.resolve({
		createReadStream: () => readStream,
		filename,
		mimetype: 'image/jpeg',
		encoding: '7bit'
	})
}

describe('storeUploadAsTemp', () => {
	afterEach(() => {
		// clean up source files
		for (const f of createdFiles.splice(0)) {
			try { if (existsSync(f)) unlinkSync(f) } catch {}
		}
	})

	it('returns originalFilename, uuid-based fileName, and filePath on success', async () => {
		const { storeUploadAsTemp } = await import('../../dist/files/storeUploadAsTemp.mjs')
		const upload = makeUploadFromBuffer(Buffer.from('hello'), 'photo.JPG')
		const result = await storeUploadAsTemp(upload)

		expect(result.originalFilename).to.equal('photo.JPG')
		expect(result.fileName).to.match(/^[0-9a-f-]+\.jpg$/)
		expect(result.filePath).to.equal(`/tmp/${result.fileName}`)

		// clean up the dest file too
		try { if (existsSync(result.filePath)) unlinkSync(result.filePath) } catch {}
	})

	it('preserves lowercase extension from filename', async () => {
		const { storeUploadAsTemp } = await import('../../dist/files/storeUploadAsTemp.mjs')
		const upload = makeUploadFromBuffer(Buffer.from('data'), 'DOC.PNG')
		const result = await storeUploadAsTemp(upload)
		expect(result.fileName).to.match(/\.png$/)
		try { if (existsSync(result.filePath)) unlinkSync(result.filePath) } catch {}
	})

	it('size-limit branch: writeStream.destroy() races with close → resolves (source behaviour)', async () => {
		// NOTE: the source calls writeStream.destroy() then unlink→reject inside the callback,
		// but destroy() emits 'close' synchronously which settles the Promise via resolve() first.
		// The reject in the unlink callback is a no-op on an already-settled Promise.
		// This documents the known behaviour: oversized uploads currently resolve rather than reject.
		const { storeUploadAsTemp } = await import('../../dist/files/storeUploadAsTemp.mjs')
		const bigBuf = Buffer.alloc(1024 * 100) // 100 KB
		const upload = makeUploadFromBuffer(bigBuf, 'big.jpg')

		// Does NOT throw — the close event wins the race
		const result = await storeUploadAsTemp(upload, 1)
		expect(result).to.be.an('object')
		// clean up
		try { if (existsSync(result.filePath)) unlinkSync(result.filePath) } catch {}
	})

	it('stream error branch: writeStream destroy race → resolves (source behaviour)', async () => {
		// Similarly: when a Readable is destroyed, writeStream.on('error') fires,
		// but the close event from destroy also fires, resolving the Promise first.
		const { storeUploadAsTemp } = await import('../../dist/files/storeUploadAsTemp.mjs')
		const { Readable } = await import('node:stream')
		const errStream = new Readable({
			read() {
				process.nextTick(() => this.destroy(new Error('read stream destroyed')))
			}
		})

		const upload = makeUploadFromStream(errStream, 'fail.jpg')

		// Does NOT throw due to the same close-event race in source
		const result = await storeUploadAsTemp(upload)
		expect(result).to.be.an('object')
		try { if (existsSync(result.filePath)) unlinkSync(result.filePath) } catch {}
	})
})
