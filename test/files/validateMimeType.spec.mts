import { expect } from 'chai'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

import { validateMimeType } from '../../dist/files/validateMimeType.mjs'
import { validateMimeTypePdf } from '../../dist/files/validateMimeTypePdf.mjs'
import { validateJpgPngMimeType } from '../../dist/files/validateMimeTypeImages.mjs'

// 1x1 PNG (89 50 4E 47 0D 0A 1A 0A ...)
const PNG_1x1 = Buffer.from(
	'89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C6300010000050001' +
	'0D0A2DB40000000049454E44AE426082',
	'hex'
)
// minimal JPEG (FF D8 FF E0 ... JFIF ... FF D9)
const JPEG_MIN = Buffer.from('FFD8FFE000104A46494600010100000100010000FFD9', 'hex')
// minimal PDF (%PDF-1.4 header)
const PDF_MIN = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n%%EOF\n', 'latin1')

describe('validateMimeType (magic-number)', () => {
	let pngFile: string
	let pdfFile: string
	let jpegFile: string

	beforeEach(async () => {
		pngFile = path.join(os.tmpdir(), `koa-utils-mt-${Date.now()}-${Math.random()}.bin`)
		pdfFile = path.join(os.tmpdir(), `koa-utils-mt-${Date.now()}-${Math.random()}.bin`)
		await fs.writeFile(pngFile, PNG_1x1)
		await fs.writeFile(pdfFile, PDF_MIN)
		jpegFile = path.join(os.tmpdir(), `koa-utils-mt-${Date.now()}-${Math.random()}.bin`)
		await fs.writeFile(jpegFile, JPEG_MIN)
	})

	afterEach(async () => {
		await fs.remove(pngFile)
		await fs.remove(pdfFile)
		await fs.remove(jpegFile)
	})

	it('validateJpgPngMimeType rejects a real PDF (allowlist must stay narrow)', async () => {
		// The only pre-existing "invalid MIME" fixture anywhere fed undetectable plaintext,
		// which file-type cannot classify at all — so it passed no matter how wide the
		// allowlist was. A real-but-disallowed type is what proves the list is narrow.
		let caught: unknown
		try {
			await validateJpgPngMimeType(pdfFile)
		} catch (e) {
			caught = e
		}
		expect(caught, 'a real PDF must not pass the jpg/png guard').to.exist
	})

	it('validateMimeTypePdf rejects every real non-PDF type (allowlist must stay narrow)', async () => {
		// Asserting only PNG was too narrow: widening the list with 'image/jpeg'
		// specifically still passed. Cover each real type the guard must exclude.
		for (const [label, file] of [
			['PNG', pngFile],
			['JPEG', jpegFile]
		] as const) {
			let caught: unknown
			try {
				await validateMimeTypePdf(file)
			} catch (e) {
				caught = e
			}
			expect(caught, `a real ${label} must not pass the pdf guard`).to.exist
		}
	})

	it('returns ext when MIME in allowlist (PNG)', async () => {
		const ext = await validateMimeType(pngFile, ['image/png'])
		expect(ext).to.equal('png')
		expect(await fs.pathExists(pngFile)).to.equal(true)
	})

	it('removes file + throws when MIME not allowed', async () => {
		let caught: unknown
		try {
			await validateMimeType(pngFile, ['application/pdf'])
		} catch (e) {
			caught = e
		}
		expect(caught).to.be.instanceOf(Error)
		expect((caught as Error).message).to.equal('Invalid file MIME type')
		expect(await fs.pathExists(pngFile)).to.equal(false)
	})

	describe('validateJpgPngMimeType', () => {
		it('returns png ext for PNG file', async () => {
			expect(await validateJpgPngMimeType(pngFile)).to.equal('png')
		})
	})

	describe('validateMimeTypePdf', () => {
		it('returns pdf ext for PDF file', async () => {
			expect(await validateMimeTypePdf(pdfFile)).to.equal('pdf')
		})
	})
})
