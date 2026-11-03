/**
 * Tests for private/files/_validateMimeType.mts
 *
 * Magic-number sniff via `file-type`: unknown content → '', allowed mime → ext, other mime → ''.
 * Real files in tmp dir, no stub.
 */
import { _validateMimeType } from '@private/files/_validateMimeType.mjs'
import { expect } from 'chai'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

// 1x1 JPEG, same bytes as reEncode.spec
const MINIMAL_JPEG_B64 =
	'/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABykX//Z'

describe('_validateMimeType', () => {
	let dir: string

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), 'validate-mime-'))
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it('content with no known magic number → empty string', async () => {
		const p = path.join(dir, 'plain.txt')
		writeFileSync(p, 'just some plain text, no magic number here')

		expect(await _validateMimeType(p, ['image/jpeg'])).to.equal('')
	})

	it('allowed mime type → file extension', async () => {
		const p = path.join(dir, 'pic.bin')
		writeFileSync(p, Buffer.from(MINIMAL_JPEG_B64, 'base64'))

		expect(await _validateMimeType(p, ['image/jpeg'])).to.equal('jpg')
	})

	it('detected mime type outside the allow-list → empty string', async () => {
		const p = path.join(dir, 'pic.bin')
		writeFileSync(p, Buffer.from(MINIMAL_JPEG_B64, 'base64'))

		expect(await _validateMimeType(p, ['application/pdf'])).to.equal('')
	})
})
