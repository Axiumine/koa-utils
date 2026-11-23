import { verifyGlbOutput } from '@private/glb/verifyGlbOutput.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { buildGlb, makeIo, patchGlbJson, splitGlb } from '../../helpers/glbFixtures.mjs'

describe('private/glb/verifyGlbOutput', () => {
	afterEach(() => sinon.restore())

	it('a valid file passes, meshopt included', async () => {
		const io = await makeIo()
		expect(await verifyGlbOutput(io, await buildGlb())).to.deep.equal([])
		expect(await verifyGlbOutput(io, await buildGlb({ compress: true, triangles: 100 }))).to.deep.equal([])
	})

	it('a validator error is reported as OUTPUT_INVALID, pointer and text kept', async () => {
		const io = await makeIo()
		const glb = patchGlbJson(await buildGlb(), (json) => {
			json['accessors'][0].count = 2_000_000_000
		})
		const reasons = await verifyGlbOutput(io, glb)
		expect(reasons.length).to.be.greaterThan(0)
		expect(reasons.every((reason) => reason.code === 'OUTPUT_INVALID')).to.equal(true)
		expect(reasons[0]?.pointer).to.equal('/accessors/0')
		expect(reasons[0]?.message).to.match(/^ACCESSOR_TOO_LONG: /)
	})

	it('a file the validator passes but meshopt cannot decode is OUTPUT_INVALID', async () => {
		const io = await makeIo()
		const glb = await buildGlb({ compress: true, triangles: 300 })
		const { json, bin } = splitGlb(glb)
		const view = json['bufferViews'].find((candidate: Record<string, any>) => candidate['extensions']?.EXT_meshopt_compression)
		const { byteOffset, byteLength } = view.extensions.EXT_meshopt_compression
		const broken = new Uint8Array(glb)
		broken.fill(0xff, glb.length - (bin?.length ?? 0) + byteOffset, glb.length - (bin?.length ?? 0) + byteOffset + byteLength)
		expect(await verifyGlbOutput(io, broken)).to.deep.equal([
			{ code: 'OUTPUT_INVALID', message: 'the sanitised file does not decode' }
		])
	})

	it('reads the file back with the reader it was given', async () => {
		const io = await makeIo()
		const read = sinon.stub(io, 'readBinary').rejects(new Error('no'))
		expect(await verifyGlbOutput(io, await buildGlb())).to.have.length(1)
		expect(read.calledOnce).to.equal(true)
	})
})
