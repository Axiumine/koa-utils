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
// minimal PDF (%PDF-1.4 header)
const PDF_MIN = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n%%EOF\n', 'latin1')

describe('validateMimeType (magic-number)', () => {
	let pngFile: string
	let pdfFile: string

	beforeEach(async () => {
		pngFile = path.join(os.tmpdir(), `koa-utils-mt-${Date.now()}-${Math.random()}.bin`)
		pdfFile = path.join(os.tmpdir(), `koa-utils-mt-${Date.now()}-${Math.random()}.bin`)
		await fs.writeFile(pngFile, PNG_1x1)
		await fs.writeFile(pdfFile, PDF_MIN)
	})

	afterEach(async () => {
		await fs.remove(pngFile)
		await fs.remove(pdfFile)
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
