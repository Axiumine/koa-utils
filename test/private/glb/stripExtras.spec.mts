import { Document } from '@gltf-transform/core'
import { stripExtras } from '@private/glb/stripExtras.mjs'
import { expect } from 'chai'

import { buildDocument } from '../../helpers/glbFixtures.mjs'

const EXTRAS = { secret: 'payload', nested: { list: [1, 2, 3] } }

interface IHasExtras {
	propertyType: string
	getExtras(): object
}

describe('private/glb/stripExtras', () => {
	it('empties the extras of every property kind in the graph, and of the root', async () => {
		const doc = await buildDocument({ extras: true, textures: [{ format: 'png' }] })
		const root = doc.getRoot()
		const material = root.listMaterials()[0]
		const info = material?.getBaseColorTextureInfo()
		const animation = doc.createAnimation('anim').setExtras(EXTRAS)
		const sampler = doc.createAnimationSampler().setExtras(EXTRAS)
		const channel = doc.createAnimationChannel().setExtras(EXTRAS)
		animation.addSampler(sampler).addChannel(channel)
		const skin = doc.createSkin('skin').setExtras(EXTRAS)
		const camera = doc.createCamera('cam').setExtras(EXTRAS)
		info?.setExtras(EXTRAS)
		root.setExtras(EXTRAS)
		stripExtras(doc)
		const all: IHasExtras[] = [
			root,
			...root.listScenes(),
			...root.listNodes(),
			...root.listMeshes(),
			...root.listAccessors(),
			...root.listMaterials(),
			...root.listTextures(),
			...root.listBuffers(),
			animation,
			sampler,
			channel,
			skin,
			camera
		]
		for (const mesh of root.listMeshes()) all.push(...mesh.listPrimitives())
		if (info) all.push(info)
		expect(all.length).to.be.greaterThan(15)
		for (const property of all) {
			expect(property.getExtras(), property.propertyType).to.deep.equal({})
		}
	})

	it('empties the extras of the root of a document with no other property', () => {
		const doc = new Document()
		doc.getRoot().setExtras(EXTRAS)
		stripExtras(doc)
		expect(doc.getRoot().getExtras()).to.deep.equal({})
	})

	it('leaves names, values and links alone', async () => {
		const doc = await buildDocument({ extras: true })
		stripExtras(doc)
		const root = doc.getRoot()
		expect(root.listNodes()[0]?.getName()).to.equal('node-0')
		expect(root.listMeshes()[0]?.getName()).to.equal('mesh')
		expect(root.listNodes()[0]?.getMesh()).to.equal(root.listMeshes()[0])
		expect(root.listAccessors()).to.have.length(2)
	})
})
