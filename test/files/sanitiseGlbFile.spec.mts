import fsp from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'

import { expect } from 'chai'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import sinon from 'sinon'

import { sanitiseGlbFile } from '../../dist/files/sanitiseGlbFile.mjs'
import { buildGlb, patchGlbJson } from '../helpers/glbFixtures.mjs'

describe('files/sanitiseGlbFile', function () {
	this.timeout(60_000)
	let tmpFile: string

	beforeEach(() => {
		tmpFile = path.join(os.tmpdir(), `koa-utils-glbfile-${Date.now()}-${Math.random()}.glb`)
	})

	afterEach(async () => {
		sinon.restore()
		syncBuiltinESMExports()
		await fs.remove(tmpFile)
	})

	it('accepted: the file at the path now holds the sanitised bytes', async () => {
		const input = await buildGlb({ extras: true, triangles: 20 })
		await fs.writeFile(tmpFile, input)
		const result = await sanitiseGlbFile(tmpFile)
		expect(result.accepted).to.equal(true)
		if (!result.accepted) return
		const onDisk = await fs.readFile(tmpFile)
		expect(Buffer.from(result.glb).equals(onDisk)).to.equal(true)
		expect(onDisk.includes('extras-payload')).to.equal(false)
		expect(onDisk.length).to.equal(result.stats.outputBytes)
		expect(result.stats.inputBytes).to.equal(input.length)
	})

	it('rejected: the file is deleted, like the extension and MIME validators do', async () => {
		const hostile = patchGlbJson(await buildGlb({ textures: [{ format: 'png' }] }), (json) => {
			json['images'][0].uri = '../../etc/passwd'
		})
		await fs.writeFile(tmpFile, hostile)
		const result = await sanitiseGlbFile(tmpFile)
		expect(result.accepted).to.equal(false)
		expect(result.reasons.map((reason) => reason.code)).to.include('URI_EXTERNAL')
		expect(await fs.pathExists(tmpFile)).to.equal(false)
	})

	it('not a GLB at all: rejected and deleted', async () => {
		await fs.writeFile(tmpFile, 'plain text, not a model')
		const result = await sanitiseGlbFile(tmpFile)
		expect(result.reasons.map((reason) => reason.code)).to.deep.equal(['GLB_BAD_MAGIC'])
		expect(await fs.pathExists(tmpFile)).to.equal(false)
	})

	it('the size gate is exact: maxBytes equal to the file passes, one less rejects and deletes', async () => {
		const input = await buildGlb({ triangles: 5 })
		await fs.writeFile(tmpFile, input)
		expect((await sanitiseGlbFile(tmpFile, { maxBytes: input.length })).accepted).to.equal(true)
		await fs.writeFile(tmpFile, input)
		const result = await sanitiseGlbFile(tmpFile, { maxBytes: input.length - 1 })
		expect(result.accepted).to.equal(false)
		expect(result.reasons).to.deep.equal([
			{ code: 'GLB_TOO_LARGE', message: `the file has ${input.length} bytes, the limit is ${input.length - 1}` }
		])
		expect(result.stats.inputBytes).to.equal(input.length)
		expect(await fs.pathExists(tmpFile)).to.equal(false)
	})

	it('a file over the default limit is refused from its size alone', async () => {
		await fs.writeFile(tmpFile, '')
		await fs.truncate(tmpFile, 40 * 1024 * 1024)
		const result = await sanitiseGlbFile(tmpFile)
		expect(result.reasons).to.deep.equal([
			{ code: 'GLB_TOO_LARGE', message: `the file has ${40 * 1024 * 1024} bytes, the limit is ${32 * 1024 * 1024}` }
		])
		expect(result.stats.inputBytes).to.equal(40 * 1024 * 1024)
		expect(await fs.pathExists(tmpFile)).to.equal(false)
	})

	it('a file over the limit is not read at all', async () => {
		const read = sinon.spy(fsp, 'readFile')
		syncBuiltinESMExports()
		await fs.writeFile(tmpFile, 'x'.repeat(200))
		const result = await sanitiseGlbFile(tmpFile, { maxBytes: 100 })
		expect(result.accepted).to.equal(false)
		expect(read.args.some(([file]) => file === tmpFile)).to.equal(false)
	})

	it('a rejected file that someone else already removed is not an error', async () => {
		const real = fsp.readFile.bind(fsp) as unknown as (file: string) => Promise<Buffer>
		sinon.stub(fsp, 'readFile').callsFake((async (file: string) => {
			const bytes = await real(file)
			await fs.remove(file)
			return bytes
		}) as unknown as typeof fsp.readFile)
		syncBuiltinESMExports()
		await fs.writeFile(tmpFile, 'plain text, not a model')
		const result = await sanitiseGlbFile(tmpFile)
		expect(result.accepted).to.equal(false)
		expect(await fs.pathExists(tmpFile)).to.equal(false)
	})

	it('an invalid option throws before the file is touched', async () => {
		const input = await buildGlb()
		await fs.writeFile(tmpFile, input)
		let caught: unknown
		try {
			await sanitiseGlbFile(tmpFile, { maxNodes: 0 })
		} catch (e) {
			caught = e
		}
		expect(caught).to.be.instanceOf(TypeError)
		expect((await fs.readFile(tmpFile)).length).to.equal(input.length)
	})

	it('a path that does not exist throws the error of fs', async () => {
		let caught: unknown
		try {
			await sanitiseGlbFile(path.join(os.tmpdir(), `koa-utils-missing-${Math.random()}.glb`))
		} catch (e) {
			caught = e
		}
		expect((caught as NodeJS.ErrnoException).code).to.equal('ENOENT')
	})
})
