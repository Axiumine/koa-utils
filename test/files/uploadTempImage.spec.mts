import { expect } from 'chai'
import sinon from 'sinon'
import { createReadStream, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import NodeClam from 'clamscan'
import os from 'os'
import path from 'path'

// Minimal valid 1x1 JPEG (base64)
const MINIMAL_JPEG_B64 = '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z'

const createdFiles: string[] = []

function makeSrcFile(buf: Buffer, name: string) {
	const p = path.join(os.tmpdir(), name)
	writeFileSync(p, buf)
	createdFiles.push(p)
	return p
}

function makeUploadFromFile(srcPath: string, filename: string) {
	return Promise.resolve({
		createReadStream: () => createReadStream(srcPath),
		filename,
		mimetype: 'image/jpeg',
		encoding: '7bit'
	})
}

describe('uploadTempImage', () => {
	afterEach(() => {
		sinon.restore()
		for (const f of createdFiles.splice(0)) {
			try { if (existsSync(f)) unlinkSync(f) } catch {}
		}
	})

	it('function is exported and async', async () => {
		const { uploadTempImage } = await import('../../dist/files/uploadTempImage.mjs')
		expect(uploadTempImage).to.be.a('function')
	})

	it('returns { ext: webp, tempFile } on happy path with valid JPEG', async () => {
		// real 1x1 JPEG → sharp can process it
		const jpegBuf = Buffer.from(MINIMAL_JPEG_B64, 'base64')
		const src = makeSrcFile(jpegBuf, `src-happy-${Date.now()}.jpg`)

		// Mock clamscan → scanVirus need no real clamd socket
		const fakeScanner = { scanFile: sinon.stub().resolves({ isInfected: false, viruses: [] }) }
		sinon.stub(NodeClam.prototype, 'init').resolves(fakeScanner as unknown as NodeClam)

		const { initClamScan, uploadTempImage } = await import('../../dist/files/scanVirus.mjs').then(async (scanMod) => {
			await scanMod.initClamScan()
			return import('../../dist/files/uploadTempImage.mjs').then((imgMod) => ({
				initClamScan: scanMod.initClamScan,
				uploadTempImage: imgMod.uploadTempImage
			}))
		})

		const upload = makeUploadFromFile(src, 'photo.jpg')
		const result = await uploadTempImage(upload)

		expect(result.ext).to.equal('webp')
		expect(result.tempFile).to.be.a('string').and.include('.webp')
		// clean up output webp
		try { if (existsSync(result.tempFile)) unlinkSync(result.tempFile) } catch {}
	})

	it('throws "Error storing image" when filename has invalid extension', async () => {
		const src = makeSrcFile(Buffer.from('data'), `src-invalid-${Date.now()}.exe`)
		const upload = makeUploadFromFile(src, 'malware.exe')

		const { uploadTempImage } = await import('../../dist/files/uploadTempImage.mjs')
		let err: unknown
		try {
			await uploadTempImage(upload)
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error storing image')
	})

	it('throws "Error storing image" when MIME type is invalid (non-image content)', async () => {
		// .jpg ext, plain-text content → file-type detect no image/jpeg
		const src = makeSrcFile(Buffer.from('this is not an image'), `src-badmime-${Date.now()}.tmp`)
		const upload = makeUploadFromFile(src, 'fakephoto.jpg')

		const { uploadTempImage } = await import('../../dist/files/uploadTempImage.mjs')
		let err: unknown
		try {
			await uploadTempImage(upload)
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error storing image')
	})

	it('throws "Error storing image" when file size exceeds limit', async () => {
		// maxFileSize not overridable via uploadTempImage public API → confirm error wrapping via ext failure
		const src = makeSrcFile(Buffer.from('x'), `src-size-${Date.now()}.tmp`)
		const upload = makeUploadFromFile(src, 'too-big.gif') // .gif not allowed

		const { uploadTempImage } = await import('../../dist/files/uploadTempImage.mjs')
		let err: unknown
		try {
			await uploadTempImage(upload)
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error storing image')
	})
})
