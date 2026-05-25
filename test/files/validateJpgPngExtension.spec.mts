import { expect } from 'chai'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

import { validateJpgPngExtension } from '../../dist/files/validateJpgPngExtension.mjs'
import { validatePdfExtension } from '../../dist/files/validatePdfExtension.mjs'

describe('extension validators (jpg/png + pdf) clean up bad files', () => {
	let tmpFile: string

	beforeEach(async () => {
		tmpFile = path.join(os.tmpdir(), `koa-utils-ext-${Date.now()}-${Math.random()}`)
		await fs.writeFile(tmpFile, 'x')
	})

	afterEach(async () => {
		await fs.remove(tmpFile)
	})

	describe('validateJpgPngExtension', () => {
		it('does not throw for .jpg / .jpeg / .png', async () => {
			await validateJpgPngExtension('a.jpg', tmpFile)
			await validateJpgPngExtension('a.jpeg', tmpFile)
			await validateJpgPngExtension('a.png', tmpFile)
			expect(await fs.pathExists(tmpFile)).to.equal(true)
		})

		it('throws "Invalid file extension" + removes file on bad ext', async () => {
			let caught: unknown
			try {
				await validateJpgPngExtension('a.gif', tmpFile)
			} catch (e) {
				caught = e
			}
			expect(caught).to.be.instanceOf(Error)
			expect((caught as Error).message).to.equal('Invalid file extension')
			expect(await fs.pathExists(tmpFile)).to.equal(false)
		})
	})

	describe('validatePdfExtension', () => {
		it('does not throw for .pdf', async () => {
			await validatePdfExtension('doc.pdf', tmpFile)
			expect(await fs.pathExists(tmpFile)).to.equal(true)
		})

		it('throws + removes file on non-pdf', async () => {
			let caught: unknown
			try {
				await validatePdfExtension('doc.jpg', tmpFile)
			} catch (e) {
				caught = e
			}
			expect(caught).to.be.instanceOf(Error)
			expect((caught as Error).message).to.equal('Invalid file extension')
			expect(await fs.pathExists(tmpFile)).to.equal(false)
		})
	})
})
