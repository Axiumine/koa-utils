import { expect } from 'chai'

describe('reEncodeToWebp', () => {
	it('is a function', async () => {
		const { reEncodeToWebp } = await import('../../dist/files/reEncodeToWebp.mjs')
		expect(reEncodeToWebp).to.be.a('function')
	})

	it('propagates error processing non-existent file (default quality)', async () => {
		const { reEncodeToWebp } = await import('../../dist/files/reEncodeToWebp.mjs')
		let err: unknown
		try {
			await reEncodeToWebp('/tmp/nope.webp')
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('Error processing the image')
	})

	it('propagates error with custom quality', async () => {
		const { reEncodeToWebp } = await import('../../dist/files/reEncodeToWebp.mjs')
		let err: unknown
		try {
			await reEncodeToWebp('/tmp/nope.webp', 90)
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('Error processing the image')
	})
})
