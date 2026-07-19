/**
 * Tests for private/files/assertNoTraversal.mts
 */
import { expect } from 'chai'

import { assertNoTraversal } from '../../../dist/private/files/assertNoTraversal.mjs'

describe('assertNoTraversal', () => {
	it('plain segment → does not throw', () => {
		expect(() => assertNoTraversal('avatars', 'folder')).to.not.throw()
	})

	it('multi-segment value with separators → still allowed (non-breaking by design)', () => {
		expect(() => assertNoTraversal('2026/07', 'folder')).to.not.throw()
	})

	it('empty string → does not throw', () => {
		expect(() => assertNoTraversal('', 'folder')).to.not.throw()
	})

	it('a name merely containing dots is not a traversal', () => {
		expect(() => assertNoTraversal('my..file', 'destFilename')).to.not.throw()
		expect(() => assertNoTraversal('..jpg', 'destFilename')).to.not.throw()
	})

	it('bare `..` → throws with the parameter name', () => {
		expect(() => assertNoTraversal('..', 'folder')).to.throw('Invalid folder: path traversal')
	})

	it('`..` as a leading component → throws', () => {
		expect(() => assertNoTraversal('../../etc', 'secondFolder')).to.throw('Invalid secondFolder: path traversal')
	})

	it('`..` as a trailing component → throws', () => {
		expect(() => assertNoTraversal('a/..', 'folder')).to.throw('Invalid folder: path traversal')
	})

	it('`..` in the middle → throws', () => {
		expect(() => assertNoTraversal('a/../b', 'folder')).to.throw('Invalid folder: path traversal')
	})

	it('backslash-separated `..` → throws (windows-style separator)', () => {
		expect(() => assertNoTraversal('a\\..\\b', 'folder')).to.throw('Invalid folder: path traversal')
	})
})
