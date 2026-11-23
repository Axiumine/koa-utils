import { expect } from 'chai'

import { checkGlbContainer } from '../../dist/files/checkGlbContainer.mjs'
import { GLB_POLICY_DEFAULTS } from '../../dist/files/GLB_POLICY_DEFAULTS.mjs'
import { packChunks, packGlb } from '../helpers/glbFixtures.mjs'

const JSON_TYPE = 0x4e4f534a
const BIN_TYPE = 0x004e4942

interface IChunk {
	type: number
	data?: number[]
	/** declared length, when it must differ from data */
	length?: number
}

// header + chunks, every field settable → each hostile layout by hand
function raw(chunks: IChunk[], header: { magic?: number; version?: number; length?: number } = {}): Uint8Array {
	const parts = chunks.map((chunk) => ({ ...chunk, data: chunk.data ?? [] }))
	const size = 12 + parts.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0)
	const out = new Uint8Array(size)
	const view = new DataView(out.buffer)
	view.setUint32(0, header.magic ?? 0x46546c67, true)
	view.setUint32(4, header.version ?? 2, true)
	view.setUint32(8, header.length ?? size, true)
	let at = 12
	for (const chunk of parts) {
		view.setUint32(at, chunk.length ?? chunk.data.length, true)
		view.setUint32(at + 4, chunk.type, true)
		out.set(chunk.data, at + 8)
		at += 8 + chunk.data.length
	}
	return out
}

const json = (text: string): number[] => Array.from(new TextEncoder().encode(text))

const rejected = (result: ReturnType<typeof checkGlbContainer>) => (result.ok ? null : result.reason)

describe('files/checkGlbContainer', () => {
	it('accepts JSON + BIN and returns both chunks as views', () => {
		const result = checkGlbContainer(packGlb({ asset: { version: '2.0' } }, Uint8Array.of(1, 2, 3, 4)))
		expect(result.ok).to.equal(true)
		if (!result.ok) return
		expect(new TextDecoder().decode(result.json).trim()).to.equal('{"asset":{"version":"2.0"}}')
		expect(Array.from(result.bin ?? [])).to.deep.equal([1, 2, 3, 4])
	})

	it('accepts a file with a JSON chunk only, and bin is null', () => {
		const result = checkGlbContainer(packGlb({ asset: { version: '2.0' } }))
		expect(result.ok).to.equal(true)
		expect(result.ok && result.bin).to.equal(null)
	})

	it('accepts a BIN chunk of length 0', () => {
		const result = checkGlbContainer(raw([{ type: JSON_TYPE, data: json('{}  ') }, { type: BIN_TYPE }]))
		expect(result.ok && result.bin?.length).to.equal(0)
	})

	it('reads a view that does not start at offset 0 of its buffer', () => {
		const glb = packGlb({ a: 1 }, Uint8Array.of(9, 8, 7, 6))
		const padded = new Uint8Array(glb.length + 10)
		padded.set(glb, 7)
		const result = checkGlbContainer(padded.subarray(7, 7 + glb.length))
		expect(result.ok).to.equal(true)
		expect(result.ok && Array.from(result.bin ?? [])).to.deep.equal([9, 8, 7, 6])
	})

	it('GLB_TRUNCATED below 20 bytes', () => {
		expect(rejected(checkGlbContainer(new Uint8Array()))).to.deep.equal({
			code: 'GLB_TRUNCATED',
			message: 'the file is too short to hold a header and a chunk'
		})
		expect(rejected(checkGlbContainer(new Uint8Array(19)))?.code).to.equal('GLB_TRUNCATED')
		expect(rejected(checkGlbContainer(new Uint8Array(20)))?.code).to.not.equal('GLB_TRUNCATED')
	})

	it('GLB_BAD_MAGIC', () => {
		expect(rejected(checkGlbContainer(raw([{ type: JSON_TYPE, data: json('{}  ') }], { magic: 0x4e4f4e45 })))).to.deep.equal({
			code: 'GLB_BAD_MAGIC',
			message: 'the file does not start with glTF'
		})
		expect(rejected(checkGlbContainer(new Uint8Array(40)))?.code).to.equal('GLB_BAD_MAGIC')
	})

	it('GLB_BAD_VERSION for version 1, 3 and 0', () => {
		for (const version of [0, 1, 3]) {
			expect(rejected(checkGlbContainer(raw([{ type: JSON_TYPE, data: json('{}  ') }], { version })))).to.deep.equal({
				code: 'GLB_BAD_VERSION',
				message: 'the GLB container version is not 2'
			})
		}
	})

	it('GLB_LENGTH_MISMATCH when the header says more or less than the file has', () => {
		const chunks = [{ type: JSON_TYPE, data: json('{}  ') }]
		const real = raw(chunks).length
		expect(rejected(checkGlbContainer(raw(chunks, { length: real + 1 })))).to.deep.equal({
			code: 'GLB_LENGTH_MISMATCH',
			message: `the header says ${real + 1} bytes, the file has ${real}`
		})
		expect(rejected(checkGlbContainer(raw(chunks, { length: real - 1 })))?.code).to.equal('GLB_LENGTH_MISMATCH')
		expect(rejected(checkGlbContainer(raw(chunks, { length: 0 })))?.code).to.equal('GLB_LENGTH_MISMATCH')
	})

	it('GLB_TOO_LARGE above maxBytes, with the default and with a custom limit', () => {
		const max = GLB_POLICY_DEFAULTS.maxBytes
		expect(rejected(checkGlbContainer(new Uint8Array(max + 1)))).to.deep.equal({
			code: 'GLB_TOO_LARGE',
			message: `the file has ${max + 1} bytes, the limit is ${max}`
		})
		expect(rejected(checkGlbContainer(new Uint8Array(max)))?.code).to.equal('GLB_BAD_MAGIC')
		const glb = packGlb({ a: 1 })
		expect(checkGlbContainer(glb, { maxBytes: glb.length }).ok).to.equal(true)
		expect(rejected(checkGlbContainer(glb, { maxBytes: glb.length - 1 }))?.code).to.equal('GLB_TOO_LARGE')
	})

	it('GLB_BAD_CHUNKS when the first chunk is not JSON', () => {
		expect(rejected(checkGlbContainer(raw([{ type: BIN_TYPE, data: json('{}  ') }])))).to.deep.equal({
			code: 'GLB_BAD_CHUNKS',
			message: 'the first chunk is not a JSON chunk'
		})
	})

	it('GLB_JSON_TOO_LARGE above maxJsonBytes, judged from the declared length', () => {
		const max = GLB_POLICY_DEFAULTS.maxJsonBytes
		const bomb = raw([{ type: JSON_TYPE, data: json('{}  '), length: max + 1 }])
		expect(rejected(checkGlbContainer(bomb))).to.deep.equal({
			code: 'GLB_JSON_TOO_LARGE',
			message: `the JSON chunk has ${max + 1} bytes, the limit is ${max}`
		})
		const glb = packChunks(new TextEncoder().encode('{"a":1}   '))
		expect(checkGlbContainer(glb, { maxJsonBytes: 12 }).ok).to.equal(true)
		expect(rejected(checkGlbContainer(glb, { maxJsonBytes: 11 }))?.code).to.equal('GLB_JSON_TOO_LARGE')
	})

	it('the two limits are independent', () => {
		const glb = packGlb({ a: 1 })
		expect(checkGlbContainer(glb, { maxBytes: glb.length }).ok).to.equal(true)
		expect(checkGlbContainer(glb, { maxJsonBytes: 12 }).ok).to.equal(true)
		expect(checkGlbContainer(glb, {}).ok).to.equal(true)
	})

	it('GLB_BAD_CHUNKS when the JSON chunk runs past the end of the file', () => {
		expect(rejected(checkGlbContainer(raw([{ type: JSON_TYPE, data: json('{}  '), length: 5 }])))).to.deep.equal({
			code: 'GLB_BAD_CHUNKS',
			message: 'the JSON chunk runs past the end of the file'
		})
		expect(checkGlbContainer(raw([{ type: JSON_TYPE, data: json('{}  '), length: 4 }])).ok).to.equal(true)
	})

	it('GLB_BAD_CHUNKS when 1 to 7 bytes follow the JSON chunk', () => {
		for (const extra of [1, 4, 7]) {
			const glb = raw([{ type: JSON_TYPE, data: json('{}  ') }])
			const longer = new Uint8Array(glb.length + extra)
			longer.set(glb)
			new DataView(longer.buffer).setUint32(8, longer.length, true)
			expect(rejected(checkGlbContainer(longer)), String(extra)).to.deep.equal({
				code: 'GLB_BAD_CHUNKS',
				message: 'bytes after the JSON chunk are too few for a BIN chunk'
			})
		}
	})

	it('GLB_BAD_CHUNKS when the second chunk is not BIN', () => {
		expect(
			rejected(
				checkGlbContainer(
					raw([
						{ type: JSON_TYPE, data: json('{}  ') },
						{ type: JSON_TYPE, data: [1, 2, 3, 4] }
					])
				)
			)
		).to.deep.equal({
			code: 'GLB_BAD_CHUNKS',
			message: 'the chunk after the JSON chunk is not a BIN chunk'
		})
		expect(rejected(checkGlbContainer(raw([{ type: JSON_TYPE, data: json('{}  ') }, { type: 0x12345678 }])))?.code).to.equal(
			'GLB_BAD_CHUNKS'
		)
	})

	it('GLB_BAD_CHUNKS when the BIN chunk does not end at the end of the file', () => {
		const message = 'the BIN chunk does not end where the file ends'
		const longer = raw([
			{ type: JSON_TYPE, data: json('{}  ') },
			{ type: BIN_TYPE, data: [1, 2, 3, 4], length: 8 }
		])
		expect(rejected(checkGlbContainer(longer))).to.deep.equal({ code: 'GLB_BAD_CHUNKS', message })
		const shorter = raw([
			{ type: JSON_TYPE, data: json('{}  ') },
			{ type: BIN_TYPE, data: [1, 2, 3, 4], length: 0 }
		])
		expect(rejected(checkGlbContainer(shorter))).to.deep.equal({ code: 'GLB_BAD_CHUNKS', message })
	})

	it('GLB_BAD_CHUNKS when a third chunk follows the BIN chunk', () => {
		const glb = raw([
			{ type: JSON_TYPE, data: json('{}  ') },
			{ type: BIN_TYPE, data: [1, 2, 3, 4] },
			{ type: BIN_TYPE, data: [5, 6, 7, 8] }
		])
		expect(rejected(checkGlbContainer(glb))?.code).to.equal('GLB_BAD_CHUNKS')
	})
})
