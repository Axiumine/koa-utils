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

	it('rejects an oversize upload and removes the partial file', async () => {
		// Previously this test documented the opposite: destroy() emits 'close', which
		// resolved the Promise before the unlink callback's reject() could run, so an
		// oversize upload reported SUCCESS while returning a path that had just been
		// deleted. The rejection is now issued from the 'close' handler itself, after
		// cleanup, so there is no race to lose.
		const { storeUploadAsTemp } = await import('../../dist/files/storeUploadAsTemp.mjs')
		const bigBuf = Buffer.alloc(1024 * 100) // 100 KB against a 1-byte limit
		const upload = makeUploadFromBuffer(bigBuf, 'big.jpg')

		let caught: unknown
		let result: { filePath: string } | undefined
		try {
			result = await storeUploadAsTemp(upload, 1)
		} catch (e) {
			caught = e
		}

		expect(caught, 'an oversize upload must reject').to.be.instanceOf(Error)
		expect((caught as Error).message).to.contain('exceeds the limit')
		expect(result, 'no IStoreFile may be returned for a rejected upload').to.equal(undefined)
	})

	it('rejects with the underlying error when the read stream fails', async () => {
		// Same defect as the size-limit path: writeStream.on('error') unlinked and then
		// rejected from the unlink callback, but 'close' had already resolved the
		// Promise — so a FAILED upload reported success. The error is now recorded and
		// the single settle point in 'close' rejects with it. The old code also rejected
		// with 'File size exceeds the limit.' regardless of cause; the real error is
		// propagated now.
		const { storeUploadAsTemp } = await import('../../dist/files/storeUploadAsTemp.mjs')
		const { Readable } = await import('node:stream')
		const errStream = new Readable({
			read() {
				process.nextTick(() => this.destroy(new Error('read stream destroyed')))
			}
		})

		const upload = makeUploadFromStream(errStream, 'fail.jpg')

		let caught: unknown
		let result: { filePath: string } | undefined
		try {
			result = await storeUploadAsTemp(upload)
		} catch (e) {
			caught = e
		}

		expect(caught, 'a failed upload must reject').to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal('read stream destroyed')
		expect(result, 'no IStoreFile may be returned for a failed upload').to.equal(undefined)
	})
})
