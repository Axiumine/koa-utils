import { expect } from 'chai'

describe('reEncodeToPng', () => {
	afterEach(() => {})

	it('is a function', async () => {
		const { reEncodeToPng } = await import('../../dist/files/reEncodeToPng.mjs')
		expect(reEncodeToPng).to.be.a('function')
	})

	it('propagates error processing non-existent file (default quality)', async () => {
		const { reEncodeToPng } = await import('../../dist/files/reEncodeToPng.mjs')
		let err: unknown
		try {
			await reEncodeToPng('/tmp/nope.png')
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error processing the image')
	})

	it('propagates error with custom quality', async () => {
		const { reEncodeToPng } = await import('../../dist/files/reEncodeToPng.mjs')
		let err: unknown
		try {
			await reEncodeToPng('/tmp/nope.png', 75)
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('Error processing the image')
	})
})
