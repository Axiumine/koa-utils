import { expect } from 'chai'
import sinon from 'sinon'
import { createReadStream, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import NodeClam from 'clamscan'
import os from 'os'
import path from 'path'

// Minimal valid PDF (base64)
const MINIMAL_PDF_B64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMDAgMTAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMDkgMDAwMDAgbgowMDAwMDAwMDU4IDAwMDAwIG4KMDAwMDAwMDExNSAwMDAwMCBuCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTkwCiUlRU9G'

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
		mimetype: 'application/pdf',
		encoding: '7bit'
	})
}

describe('uploadTempPdf', () => {
	afterEach(() => {
		sinon.restore()
		for (const f of createdFiles.splice(0)) {
			try { if (existsSync(f)) unlinkSync(f) } catch {}
		}
	})

	it('function is exported and async', async () => {
		const { uploadTempPdf } = await import('../../dist/files/uploadTempPdf.mjs')
		expect(uploadTempPdf).to.be.a('function')
	})

	it('returns { ext: pdf, tempFile } on happy path with valid PDF', async () => {
		const pdfBuf = Buffer.from(MINIMAL_PDF_B64, 'base64')
		const src = makeSrcFile(pdfBuf, `src-happy-pdf-${Date.now()}.pdf`)

		const fakeScanner = { scanFile: sinon.stub().resolves({ isInfected: false, viruses: [] }) }
		sinon.stub(NodeClam.prototype, 'init').resolves(fakeScanner as unknown as NodeClam)

		const scanMod = await import('../../dist/files/scanVirus.mjs')
		await scanMod.initClamScan()

		const { uploadTempPdf } = await import('../../dist/files/uploadTempPdf.mjs')
		const upload = makeUploadFromFile(src, 'document.pdf')
		const result = await uploadTempPdf(upload)

		expect(result.ext).to.equal('pdf')
		expect(result.tempFile).to.be.a('string').and.include('.pdf')
		try { if (existsSync(result.tempFile)) unlinkSync(result.tempFile) } catch {}
	})

	it('throws "Error storing pdf" when filename has invalid extension', async () => {
		const src = makeSrcFile(Buffer.from('data'), `src-pdf-invalid-${Date.now()}.exe`)
		const upload = makeUploadFromFile(src, 'malware.exe')

		const { uploadTempPdf } = await import('../../dist/files/uploadTempPdf.mjs')
		let err: unknown
		try {
			await uploadTempPdf(upload)
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error storing pdf')
	})

	it('throws "Error storing pdf" when MIME type is invalid (non-pdf content)', async () => {
		// .pdf extension but content is plain text → file-type won't detect application/pdf
		const src = makeSrcFile(Buffer.from('this is not a pdf'), `src-pdf-badmime-${Date.now()}.tmp`)
		const upload = makeUploadFromFile(src, 'fakepdf.pdf')

		const { uploadTempPdf } = await import('../../dist/files/uploadTempPdf.mjs')
		let err: unknown
		try {
			await uploadTempPdf(upload)
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error storing pdf')
	})

	it('throws "Error storing pdf" when .txt extension provided', async () => {
		const src = makeSrcFile(Buffer.from('text content'), `src-pdf-txt-${Date.now()}.tmp`)
		const upload = makeUploadFromFile(src, 'document.txt')

		const { uploadTempPdf } = await import('../../dist/files/uploadTempPdf.mjs')
		let err: unknown
		try {
			await uploadTempPdf(upload)
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error storing pdf')
	})
})
