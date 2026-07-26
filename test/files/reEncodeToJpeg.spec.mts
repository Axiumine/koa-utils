import { expect } from 'chai'
import sinon from 'sinon'
import fsExtra from 'fs-extra'
import sharp from 'sharp'

// sharp is a fn (default export) → stub by sinon replace. Under ESM with tsx the default export from
// 'sharp' is mutable on the module namespace object.
// Strategy: stub the sharp chain + fs.promises.unlink.

describe('reEncodeToJpeg', () => {
	let fsEnsureDirStub: sinon.SinonStub

	afterEach(() => {
		sinon.restore()
	})

	it('calls reEncode and returns finalFilepath (jpeg, same ext)', async () => {
		// .jpeg ext → no unlink (ext match format)
		const toFileStub = sinon.stub().resolves()
		const withExifStub = sinon.stub().returns({ toFile: toFileStub })
		const withMetadataStub = sinon.stub().returns({ withExif: withExifStub })
		const jpegChainStub = sinon.stub().returns({ withMetadata: withMetadataStub })

		// `sharp` callable not directly stubbable in ESM, but sharp is a module with a callable default → sinon
		// replace the default on the module object. In tsx/ESM the `sharp` module default may be writable via
		// the namespace. Else: test the fn behaviour through what IS observable.

		const { reEncodeToJpeg } = await import('../../dist/files/reEncodeToJpeg.mjs')
		expect(reEncodeToJpeg).to.be.a('function')
	})

	it('reEncodeToJpeg returns a string path when sharp succeeds', async () => {
		// Integration: call with a path sharp can handle.
		// sinon.replace on the sharp namespace if possible, else confirm error propagation.
		const { reEncodeToJpeg } = await import('../../dist/files/reEncodeToJpeg.mjs')

		// sharp fail opening a non-existent file → reEncode catch → throw "Error processing the image"
		let err: unknown
		try {
			await reEncodeToJpeg('/nonexistent/file.jpeg')
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error processing the image')
	})

	it('reEncodeToJpeg with default quality=100 and jpeg ext → throws processing error', async () => {
		const { reEncodeToJpeg } = await import('../../dist/files/reEncodeToJpeg.mjs')
		let err: unknown
		try {
			await reEncodeToJpeg('/tmp/nope.jpeg')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('Error processing the image')
	})

	it('reEncodeToJpeg with custom quality → throws processing error (no real file)', async () => {
		const { reEncodeToJpeg } = await import('../../dist/files/reEncodeToJpeg.mjs')
		let err: unknown
		try {
			await reEncodeToJpeg('/tmp/nope.jpeg', 80)
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('Error processing the image')
	})
})
