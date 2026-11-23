import { expect } from 'chai'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

import { validateGlbExtension } from '../../dist/files/validateGlbExtension.mjs'
import { validateMimeTypeGlb } from '../../dist/files/validateMimeTypeGlb.mjs'
import { buildGlb, makeImage } from '../helpers/glbFixtures.mjs'

describe('GLB validators', () => {
	let tmpFile: string

	beforeEach(() => {
		tmpFile = path.join(os.tmpdir(), `koa-utils-glb-${Date.now()}-${Math.random()}.bin`)
	})

	afterEach(async () => {
		await fs.remove(tmpFile)
	})

	describe('validateGlbExtension', () => {
		beforeEach(async () => {
			await fs.writeFile(tmpFile, 'x')
		})

		it('does not throw for .glb, in any case', async () => {
			await validateGlbExtension('model.glb', tmpFile)
			await validateGlbExtension('MODEL.GLB', tmpFile)
			expect(await fs.pathExists(tmpFile)).to.equal(true)
		})

		it('throws "Invalid file extension" and removes the file for anything else', async () => {
			for (const name of ['model.gltf', 'model.png', 'model.glb.exe', 'glb']) {
				await fs.writeFile(tmpFile, 'x')
				let caught: unknown
				try {
					await validateGlbExtension(name, tmpFile)
				} catch (e) {
					caught = e
				}
				expect(caught, name).to.be.instanceOf(Error)
				expect((caught as Error).message).to.equal('Invalid file extension')
				expect(await fs.pathExists(tmpFile), name).to.equal(false)
			}
		})
	})

	describe('validateMimeTypeGlb', () => {
		it('returns glb for a real GLB, and keeps the file', async () => {
			await fs.writeFile(tmpFile, await buildGlb())
			expect(await validateMimeTypeGlb(tmpFile)).to.equal('glb')
			expect(await fs.pathExists(tmpFile)).to.equal(true)
		})

		it('throws "Invalid file MIME type" and removes the file for a real image', async () => {
			await fs.writeFile(tmpFile, await makeImage('png'))
			let caught: unknown
			try {
				await validateMimeTypeGlb(tmpFile)
			} catch (e) {
				caught = e
			}
			expect(caught).to.be.instanceOf(Error)
			expect((caught as Error).message).to.equal('Invalid file MIME type')
			expect(await fs.pathExists(tmpFile)).to.equal(false)
		})

		it('throws for plain text and for a JSON glTF', async () => {
			for (const text of ['hello', '{"asset":{"version":"2.0"}}']) {
				await fs.writeFile(tmpFile, text)
				let caught: unknown
				try {
					await validateMimeTypeGlb(tmpFile)
				} catch (e) {
					caught = e
				}
				expect(caught, text).to.be.instanceOf(Error)
			}
		})
	})
})
