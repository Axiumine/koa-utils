import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assertSnapshot, checkSnapshot, serialiseSnapshot } from './snapshot.mjs'

describe('helpers/snapshot', () => {
	let dir: string
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'koa-utils-snap-'))
	})
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	it('serialiseSnapshot uses tab indent and a trailing newline', () => {
		assert.equal(serialiseSnapshot({ a: [1] }), '{\n\t"a": [\n\t\t1\n\t]\n}\n')
	})

	it('checkSnapshot with update=true writes the file, creating missing directories', () => {
		const file = join(dir, 'nested', 'x.json')
		checkSnapshot(file, { a: 1 }, true)
		assert.equal(readFileSync(file, 'utf8'), serialiseSnapshot({ a: 1 }))
	})

	it('checkSnapshot with update=false passes when the file matches', () => {
		const file = join(dir, 'x.json')
		writeFileSync(file, serialiseSnapshot({ a: 1 }))
		checkSnapshot(file, { a: 1 }, false)
	})

	it('checkSnapshot with update=false throws when the file differs', () => {
		const file = join(dir, 'x.json')
		writeFileSync(file, serialiseSnapshot({ a: 1 }))
		assert.throws(() => checkSnapshot(file, { a: 2 }, false), assert.AssertionError)
	})

	it('checkSnapshot with update=false throws a helpful error when the file is missing', () => {
		assert.throws(() => checkSnapshot(join(dir, 'none.json'), {}, false), /Snapshot missing: .*UPDATE_SNAPSHOT=1/)
	})

	it('assertSnapshot reads the committed file in test/__snapshots__ unless UPDATE_SNAPSHOT=1', () => {
		const saved = process.env['UPDATE_SNAPSHOT']
		delete process.env['UPDATE_SNAPSHOT']
		try {
			assert.throws(() => assertSnapshot('does-not-exist.json', {}), /Snapshot missing/)
		} finally {
			if (saved !== undefined) process.env['UPDATE_SNAPSHOT'] = saved
		}
	})
})
