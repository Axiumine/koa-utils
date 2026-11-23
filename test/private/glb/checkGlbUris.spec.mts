import { checkGlbUris } from '@private/glb/checkGlbUris.mjs'
import { expect } from 'chai'

describe('private/glb/checkGlbUris', () => {
	it('accepts buffers and images that carry no uri', () => {
		expect(checkGlbUris({ buffers: [{ byteLength: 4 }], images: [{ bufferView: 0, mimeType: 'image/png' }] })).to.deep.equal([])
		expect(checkGlbUris({})).to.deep.equal([])
	})

	it('rejects a path with ../ as external', () => {
		expect(checkGlbUris({ buffers: [{ byteLength: 4, uri: '../../etc/passwd' }] })).to.deep.equal([
			{
				code: 'URI_EXTERNAL',
				pointer: '/buffers/0/uri',
				message: 'buffers[0] points at an external resource, only the embedded GLB buffer is allowed'
			}
		])
	})

	it('rejects absolute paths and remote URLs as external, on images too', () => {
		const json = {
			images: [
				{ uri: '/etc/passwd' },
				{ uri: 'https://evil.example/x.png' },
				{ uri: 'file:///etc/passwd' },
				{ uri: 'texture.png' }
			]
		}
		const reasons = checkGlbUris(json)
		expect(reasons.map((reason) => reason.code)).to.deep.equal(['URI_EXTERNAL', 'URI_EXTERNAL', 'URI_EXTERNAL', 'URI_EXTERNAL'])
		expect(reasons.map((reason) => reason.pointer)).to.deep.equal([
			'/images/0/uri',
			'/images/1/uri',
			'/images/2/uri',
			'/images/3/uri'
		])
		expect(reasons[3]?.message).to.equal('images[3] points at an external resource, only the embedded GLB buffer is allowed')
	})

	it('rejects a data: URI with its own code, whatever the case', () => {
		const json = {
			buffers: [{ uri: 'data:application/octet-stream;base64,AAAA' }],
			images: [{ uri: 'DATA:image/png;base64,AAAA' }]
		}
		expect(checkGlbUris(json)).to.deep.equal([
			{
				code: 'URI_DATA',
				pointer: '/buffers/0/uri',
				message: 'buffers[0] carries a data: URI, only the embedded GLB buffer is allowed'
			},
			{
				code: 'URI_DATA',
				pointer: '/images/0/uri',
				message: 'images[0] carries a data: URI, only the embedded GLB buffer is allowed'
			}
		])
	})

	it('a text that only contains data: is not a data URI', () => {
		expect(checkGlbUris({ images: [{ uri: 'x/data:y' }] })[0]?.code).to.equal('URI_EXTERNAL')
	})

	it('treats a uri that is not a string as external, an empty string too', () => {
		expect(checkGlbUris({ buffers: [{ uri: 123 }, { uri: null }, { uri: '' }] }).map((reason) => reason.code)).to.deep.equal([
			'URI_EXTERNAL',
			'URI_EXTERNAL',
			'URI_EXTERNAL'
		])
	})

	it('ignores collections that are not arrays and items that are not objects', () => {
		expect(checkGlbUris({ buffers: 'x', images: [5, null, 'uri'] })).to.deep.equal([])
		expect(checkGlbUris({ buffers: { uri: 'x' } })).to.deep.equal([])
	})
})
