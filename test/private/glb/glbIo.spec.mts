import { WebIO } from '@gltf-transform/core'
import { createGlbIo } from '@private/glb/glbIo.mjs'
import { expect } from 'chai'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sinon from 'sinon'

import { buildGlb, patchGlbJson } from '../../helpers/glbFixtures.mjs'

const extensionNames = async (io: WebIO, glb: Uint8Array): Promise<string[]> =>
	(await io.readBinary(glb))
		.getRoot()
		.listExtensionsUsed()
		.map((extension) => extension.extensionName)

describe('private/glb/glbIo', () => {
	afterEach(() => sinon.restore())

	it('registers exactly the allowed extensions: clearcoat survives when allowed, is dropped when not', async () => {
		const glb = await buildGlb({ clearcoat: true })
		expect(await extensionNames(await createGlbIo(['KHR_materials_clearcoat']), glb)).to.deep.equal(['KHR_materials_clearcoat'])
		expect(await extensionNames(await createGlbIo([]), glb)).to.deep.equal([])
		expect(await extensionNames(await createGlbIo(['KHR_materials_unlit']), glb)).to.deep.equal([])
	})

	it('has the meshopt decoder and encoder ready', async () => {
		const io = await createGlbIo(['EXT_meshopt_compression', 'KHR_mesh_quantization'])
		const glb = await buildGlb({ compress: true, triangles: 100 })
		const doc = await io.readBinary(glb)
		expect(doc.getRoot().listAccessors()[1]?.getCount()).to.equal(300)
		const written = await io.writeBinary(doc)
		expect(written.length).to.be.greaterThan(0)
	})

	it('waits for the meshopt decoder and for the encoder before it hands out the reader', async () => {
		const seen: string[] = []
		const watch = (codec: { ready: Promise<void> }, name: string): (() => void) => {
			const real = codec.ready
			const thenable = {
				then: (resolve: () => void, reject: () => void) => {
					seen.push(name)
					return real.then(resolve, reject)
				}
			}
			Object.defineProperty(codec, 'ready', { value: thenable, configurable: true, writable: true })
			return () => Object.defineProperty(codec, 'ready', { value: real, configurable: true, writable: true })
		}
		const restoreDecoder = watch(MeshoptDecoder, 'decoder')
		const restoreEncoder = watch(MeshoptEncoder, 'encoder')
		try {
			await createGlbIo([])
		} finally {
			restoreDecoder()
			restoreEncoder()
		}
		expect(seen.sort()).to.deep.equal(['decoder', 'encoder'])
	})

	it('cannot read a file that requires meshopt when meshopt is not allowed', async () => {
		let error: unknown
		try {
			await (await createGlbIo([])).readBinary(await buildGlb({ compress: true, triangles: 100 }))
		} catch (e) {
			error = e
		}
		expect(error).to.be.instanceOf(Error)
	})

	it('is silent: a file that declares an unknown extension prints nothing', async () => {
		const glb = patchGlbJson(await buildGlb(), (json) => {
			json['extensionsUsed'] = ['FOO_bar']
		})
		const warn = sinon.stub(console, 'warn')
		const info = sinon.stub(console, 'info')
		const log = sinon.stub(console, 'log')
		// control: the default logger of glTF Transform does print
		await new WebIO().readBinary(glb)
		expect(warn.called || info.called || log.called).to.equal(true)
		warn.resetHistory()
		info.resetHistory()
		log.resetHistory()
		await (await createGlbIo([])).readBinary(glb)
		expect(warn.called).to.equal(false)
		expect(info.called).to.equal(false)
		expect(log.called).to.equal(false)
	})
})
