import { deepStrictEqual } from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// snapshot files live in test/__snapshots__, read from repo root → cwd = repo root under yarn test
export const SNAPSHOT_DIR = resolve(process.cwd(), 'test', '__snapshots__')

// tab indent + trailing newline → stable git diff, matches .editorconfig
export function serialiseSnapshot(value: unknown): string {
	return `${JSON.stringify(value, null, '\t')}\n`
}

// update=true → overwrite file, else compare. 1 fn, both branches tested in snapshot.spec.mts
export function checkSnapshot(file: string, actual: unknown, update: boolean): void {
	if (update) {
		mkdirSync(dirname(file), { recursive: true })
		writeFileSync(file, serialiseSnapshot(actual))
		return
	}
	if (!existsSync(file)) {
		throw new Error(`Snapshot missing: ${file}. Generate: UPDATE_SNAPSHOT=1 yarn test`)
	}
	deepStrictEqual(actual, JSON.parse(readFileSync(file, 'utf8')))
}

// spec entry point: UPDATE_SNAPSHOT=1 → regenerate, reviewer read git diff as API change
export function assertSnapshot(name: string, actual: unknown): void {
	checkSnapshot(resolve(SNAPSHOT_DIR, name), actual, process.env['UPDATE_SNAPSHOT'] === '1')
}
