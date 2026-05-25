import { expect } from 'chai'
import sinon from 'sinon'
import fsExtra from 'fs-extra'
import { moveFileStaticDomain } from '../../dist/files/moveFileStaticDomain.mjs'

describe('moveFileStaticDomain', () => {
	let ensureDirStub: sinon.SinonStub
	let moveStub: sinon.SinonStub
	const originalStaticFolder = process.env.STATIC_FOLDER

	beforeEach(() => {
		ensureDirStub = sinon.stub(fsExtra, 'ensureDir').resolves()
		moveStub = sinon.stub(fsExtra, 'move').resolves()
		process.env.STATIC_FOLDER = '/var/www/static'
	})

	afterEach(() => {
		sinon.restore()
		process.env.STATIC_FOLDER = originalStaticFolder
	})

	it('ensures destination dir built from STATIC_FOLDER', async () => {
		await moveFileStaticDomain('/tmp/src.pdf', 'docs', 'reports', 'report2024')
		expect(ensureDirStub.calledOnceWith('/var/www/static/docs/reports')).to.be.true
	})

	it('moves file to correct path preserving source extension', async () => {
		await moveFileStaticDomain('/tmp/file.txt', 'dir1', 'dir2', 'output')
		expect(moveStub.calledOnceWith('/tmp/file.txt', '/var/www/static/dir1/dir2/output.txt')).to.be.true
	})

	it('uses "undefined" string when STATIC_FOLDER env var is not set', async () => {
		delete process.env.STATIC_FOLDER
		await moveFileStaticDomain('/tmp/src.pdf', 'a', 'b', 'c')
		const destArg = ensureDirStub.firstCall.args[0] as string
		expect(destArg).to.equal('undefined/a/b')
	})

	it('propagates errors from ensureDir', async () => {
		ensureDirStub.rejects(new Error('mkdir failed'))
		let err: unknown
		try {
			await moveFileStaticDomain('/tmp/src.pdf', 'a', 'b', 'c')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('mkdir failed')
	})

	it('propagates errors from move', async () => {
		moveStub.rejects(new Error('move failed'))
		let err: unknown
		try {
			await moveFileStaticDomain('/tmp/src.pdf', 'a', 'b', 'c')
		} catch (e) {
			err = e
		}
		expect((err as Error).message).to.equal('move failed')
	})
})
