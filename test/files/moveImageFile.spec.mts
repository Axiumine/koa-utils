import { expect } from 'chai'
import sinon from 'sinon'
import fsExtra from 'fs-extra'
import { UPLOAD_IMG_DIRECTORY_URL } from '../../dist/files/fileConst.mjs'
import { moveImageFile } from '../../dist/files/moveImageFile.mjs'

describe('moveImageFile', () => {
	let ensureDirStub: sinon.SinonStub
	let moveStub: sinon.SinonStub

	beforeEach(() => {
		ensureDirStub = sinon.stub(fsExtra, 'ensureDir').resolves()
		moveStub = sinon.stub(fsExtra, 'move').resolves()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('ensures correct destination directory under UPLOAD_IMG_DIRECTORY_URL', async () => {
		await moveImageFile('/tmp/src.jpg', 'users', 'avatars', 'myphoto')
		const expectedDir = `${UPLOAD_IMG_DIRECTORY_URL}/users/avatars`
		expect(ensureDirStub.calledOnceWith(expectedDir)).to.be.true
	})

	it('moves file to correct destination path with source extension', async () => {
		await moveImageFile('/tmp/photo.png', 'a', 'b', 'dest')
		const expectedDir = `${UPLOAD_IMG_DIRECTORY_URL}/a/b`
		expect(moveStub.calledOnceWith('/tmp/photo.png', `${expectedDir}/dest.png`)).to.be.true
	})

	it('propagates errors from ensureDir', async () => {
		ensureDirStub.rejects(new Error('mkdir failed'))
		let err: unknown
		try {
			await moveImageFile('/tmp/src.jpg', 'a', 'b', 'c')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('mkdir failed')
	})

	it('propagates errors from move', async () => {
		moveStub.rejects(new Error('move failed'))
		let err: unknown
		try {
			await moveImageFile('/tmp/src.jpg', 'a', 'b', 'c')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('move failed')
	})
})
