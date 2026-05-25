import { UPLOAD_IMG_DIRECTORY_URL, UPLOAD_TEMP_DIRECTORY_URL } from '../../dist/files/fileConst.mjs'
import { expect } from 'chai'
import path from 'path'

describe('fileConst', () => {
	it('UPLOAD_TEMP_DIRECTORY_URL = /tmp', () => {
		expect(UPLOAD_TEMP_DIRECTORY_URL).to.equal('/tmp')
	})

	it('UPLOAD_IMG_DIRECTORY_URL anchored at cwd + upload/uimg', () => {
		expect(UPLOAD_IMG_DIRECTORY_URL).to.equal(path.join(process.cwd(), 'upload/uimg'))
	})
})
