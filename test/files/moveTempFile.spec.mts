import { expect } from 'chai'
import sinon from 'sinon'
import fsExtra from 'fs-extra'
import { moveTempFile } from '../../dist/files/moveTempFile.mjs'

describe('moveTempFile', () => {
	let ensureDirStub: sinon.SinonStub
	let moveStub: sinon.SinonStub

	beforeEach(() => {
		ensureDirStub = sinon.stub(fsExtra, 'ensureDir').resolves()
		moveStub = sinon.stub(fsExtra, 'move').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('ensures destination dir and moves the file with correct path', async () => {
		await moveTempFile('/tmp/abc.jpg', 'newname', '/dest/dir')
		expect(ensureDirStub.calledOnceWith('/dest/dir')).to.be.true
		expect(moveStub.calledOnceWith('/tmp/abc.jpg', '/dest/dir/newname.jpg')).to.be.true
	})

	it('preserves extension from source file', async () => {
		await moveTempFile('/tmp/file.png', 'output', '/some/folder')
		const destArg = moveStub.firstCall.args[1] as string
		expect(destArg).to.equal('/some/folder/output.png')
	})

	it('handles files with no extension', async () => {
		await moveTempFile('/tmp/noext', 'renamed', '/dest')
		const destArg = moveStub.firstCall.args[1] as string
		expect(destArg).to.equal('/dest/renamed')
	})

	it('propagates ensureDir errors', async () => {
		ensureDirStub.rejects(new Error('mkdir failed'))
		let err: unknown
		try {
			await moveTempFile('/tmp/file.jpg', 'dest', '/fail')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('mkdir failed')
	})

	it('propagates move errors', async () => {
		moveStub.rejects(new Error('move failed'))
		let err: unknown
		try {
			await moveTempFile('/tmp/file.jpg', 'dest', '/dir')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('move failed')
	})
})
