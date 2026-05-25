import { validateExtension } from '../../dist/files/validateExtension.mjs'
import { expect } from 'chai'

describe('validateExtension', () => {
	it('accepts case-insensitively', () => {
		expect(validateExtension('photo.JPG', ['.jpg'])).to.equal(true)
		expect(validateExtension('photo.jpg', ['.jpg'])).to.equal(true)
	})

	it('rejects when extension missing from allowlist', () => {
		expect(validateExtension('doc.pdf', ['.jpg', '.png'])).to.equal(false)
	})

	it('returns false when no extension', () => {
		expect(validateExtension('README', ['.md'])).to.equal(false)
	})

	it('matches multiple allowed extensions', () => {
		expect(validateExtension('a.png', ['.jpg', '.png'])).to.equal(true)
	})

	it('respects only last extension', () => {
		expect(validateExtension('archive.tar.gz', ['.gz'])).to.equal(true)
		expect(validateExtension('archive.tar.gz', ['.tar'])).to.equal(false)
	})
})
