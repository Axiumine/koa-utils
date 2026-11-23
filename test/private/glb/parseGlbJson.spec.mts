import { parseGlbJson } from '@private/glb/parseGlbJson.mjs'
import { expect } from 'chai'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('private/glb/parseGlbJson', () => {
	it('returns the parsed object', () => {
		expect(parseGlbJson(bytes('{"asset":{"version":"2.0"}}'))).to.deep.equal({
			json: { asset: { version: '2.0' } },
			reasons: []
		})
	})

	it('accepts the trailing space padding GLB uses', () => {
		expect(parseGlbJson(bytes('{"a":1}   ')).json).to.deep.equal({ a: 1 })
	})

	it('rejects bytes that are not UTF-8', () => {
		const result = parseGlbJson(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))
		expect(result.json).to.equal(null)
		expect(result.reasons).to.deep.equal([{ code: 'JSON_INVALID', message: 'the JSON chunk is not valid UTF-8 JSON' }])
	})

	it('rejects a byte that is not UTF-8 even when the JSON around it is fine (no silent U+FFFD)', () => {
		const result = parseGlbJson(new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]))
		expect(result.json).to.equal(null)
		expect(result.reasons.map((reason) => reason.code)).to.deep.equal(['JSON_INVALID'])
	})

	it('rejects a syntax error and an empty chunk', () => {
		for (const text of ['{"a":', '', 'not json', '{"a":1,}']) {
			const result = parseGlbJson(bytes(text))
			expect(result.json, text).to.equal(null)
			expect(result.reasons[0]?.message, text).to.equal('the JSON chunk is not valid UTF-8 JSON')
		}
	})

	it('rejects JSON that is not one object', () => {
		for (const text of ['[]', '[{"a":1}]', 'null', '"text"', '5', 'true']) {
			const result = parseGlbJson(bytes(text))
			expect(result.json, text).to.equal(null)
			expect(result.reasons, text).to.deep.equal([
				{ code: 'JSON_INVALID', message: 'the JSON chunk does not hold one JSON object' }
			])
		}
	})
})
