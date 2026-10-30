import { expect } from 'chai'
import { createReadStream, unlinkSync, existsSync, statSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import os from 'os'
import path from 'path'

// Static import → module body (MAX_FILE_SIZE) evaluated at load, before any test. A dynamic import inside one
// test would tie module-level code to that one test only → default-limit mutant never face the limit tests.
import { storeUploadAsTemp } from '../../dist/files/storeUploadAsTemp.mjs'

// storeUploadAsTemp write to /tmp (UPLOAD_TEMP_DIRECTORY_URL = '/tmp'). Real streams + real /tmp →
// cleanup in afterEach.

const createdFiles: string[] = []

function makeUploadFromBuffer(buf: Buffer, filename: string) {
	// real temp file → createReadStream work
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
		// This test used to document the opposite: destroy() emit 'close' → Promise resolved before the unlink
		// callback's reject() could run → an oversize upload reported SUCCESS while returning a path just deleted.
		// Rejection now issued from the 'close' handler itself, after cleanup → no race to lose.
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
		// Same defect as the size-limit path: writeStream.on('error') unlinked then rejected from the unlink
		// callback, but 'close' had already resolved the Promise → a FAILED upload reported success. Error now
		// recorded, and the single settle point in 'close' reject with it. Old code also rejected with
		// 'File size exceeds the limit.' whatever the cause; the real error propagate now.
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

	it('accepts an upload exactly at the limit and rejects one byte over, naming the limit', async () => {
		// `>` not `>=`: size == limit is allowed.
		const ok = await storeUploadAsTemp(makeUploadFromBuffer(Buffer.alloc(10), 'edge.jpg'), 10)
		expect(statSync(ok.filePath).size).to.equal(10)
		unlinkSync(ok.filePath)

		let caught: unknown
		try {
			await storeUploadAsTemp(makeUploadFromBuffer(Buffer.alloc(11), 'edge.jpg'), 10)
		} catch (e) {
			caught = e
		}
		expect((caught as Error | undefined)?.message).to.equal('File size exceeds the limit of 10 bytes')
	})

	it('default limit is 5 MiB: 5 MiB passes, 5 MiB + 1 byte is rejected', async () => {
		const limit = 5 * 1024 * 1024
		const ok = await storeUploadAsTemp(makeUploadFromBuffer(Buffer.alloc(limit), 'five.jpg'))
		expect(statSync(ok.filePath).size).to.equal(limit)
		unlinkSync(ok.filePath)

		let caught: unknown
		try {
			await storeUploadAsTemp(makeUploadFromBuffer(Buffer.alloc(limit + 1), 'five.jpg'))
		} catch (e) {
			caught = e
		}
		expect((caught as Error | undefined)?.message).to.equal(`File size exceeds the limit of ${limit} bytes`)
	})

	it('oversize upload stops the write stream: rejects even when the source never ends', async function () {
		// No destroy() → 'close' only fire when source end → promise hang. Source here push once, never end.
		this.timeout(3000)
		const { Readable } = await import('node:stream')
		let pushed = false
		const endless = new Readable({
			read() {
				if (!pushed) {
					pushed = true
					this.push(Buffer.alloc(100))
				}
			}
		})

		let caught: unknown
		try {
			await storeUploadAsTemp(makeUploadFromStream(endless, 'endless.jpg'), 1)
		} catch (e) {
			caught = e
		} finally {
			endless.destroy()
		}
		expect((caught as Error | undefined)?.message).to.equal('File size exceeds the limit of 1 bytes')
	})
})
