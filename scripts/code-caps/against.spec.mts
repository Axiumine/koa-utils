import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import { compareToRef, flattenNumbers, gitReader, isSafeRef } from './against.mts'
import { CapsError } from './errors.mts'

// git hooks export GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE. A spawned `git init`, `add` or `commit` inheriting them would
// act on the REAL repository (it once rewrote a branch and the shared config from inside the pre-commit hook). Every spec that
// runs git hides all GIT_* variables first, and fails if one is still visible.
const hiddenGitEnv: Record<string, string> = {}
const hideGitEnv = (): void => {
	for (const [name, value] of Object.entries(process.env)) {
		if (name.startsWith('GIT_') && value !== undefined) {
			hiddenGitEnv[name] = value
			delete process.env[name]
		}
	}
	expect(Object.keys(process.env).filter((name) => name.startsWith('GIT_'))).to.deep.equal([])
}
const restoreGitEnv = (): void => {
	Object.assign(process.env, hiddenGitEnv)
}

describe('isSafeRef', () => {
	it('accepts ordinary refs and rejects option-like or odd ones', () => {
		for (const ok of ['origin/main', 'HEAD~2', 'v1.2.3', 'abc123', 'refs/remotes/origin/main', 'main@x']) {
			expect(isSafeRef(ok), ok).to.equal(true)
		}
		for (const bad of ['', '-x', '--upload-pack=x', 'a b', 'a;b', 'a$(b)', 'a\nb', '.hidden']) {
			expect(isSafeRef(bad), JSON.stringify(bad)).to.equal(false)
		}
	})
})

describe('flattenNumbers', () => {
	it('flattens the caps baseline shape and the suppressions shape, skipping non-numbers', () => {
		expect([...flattenNumbers('{"a|b|c":5}', 'f')]).to.deep.equal([['a|b|c', 5]])
		const nested = '{"src/x.mts":{"rule":{"count":2},"r2":{"count":1}},"s":"text","n":null,"t":true,"arr":[7]}'
		expect([...flattenNumbers(nested, 'f')]).to.deep.equal([
			['src/x.mts > rule > count', 2],
			['src/x.mts > r2 > count', 1],
			['arr > 0', 7]
		])
		expect(flattenNumbers('3', 'f').get('')).to.equal(3)
		expect(flattenNumbers('{}', 'f').size).to.equal(0)
	})

	it('throws a CapsError naming the source on invalid JSON', () => {
		expect(() => flattenNumbers('{ nope', 'where')).to.throw(CapsError, 'where is not valid JSON')
	})
})

describe('compareToRef', () => {
	const cur = new Map([
		['a', 1],
		['b', 3],
		['c', 2]
	])

	it('allows everything when the ref has no such file', () => {
		expect(compareToRef('f', cur, undefined, 'r')).to.deep.equal([])
	})

	it('allows equal and lower values and removed keys', () => {
		const base = new Map([
			['a', 1],
			['b', 5],
			['c', 2],
			['gone', 9]
		])
		expect(compareToRef('f', cur, base, 'r')).to.deep.equal([])
	})

	it('flags a new key and a higher value, nothing else', () => {
		const base = new Map([
			['a', 1],
			['b', 2]
		])
		expect(compareToRef('f', cur, base, 'r')).to.deep.equal([
			'HIGHER f: b = 3 (r has 2: shrink it back)',
			'NEW    f: c = 2 (not in r: fix the code, do not add debt)'
		])
	})

	it('treats an empty ref file as "no debt allowed": every key is new', () => {
		expect(compareToRef('f', cur, new Map(), 'r')).to.have.length(3)
	})
})

describe('gitReader', () => {
	let root = ''
	const git = (...args: string[]): void => {
		const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
			cwd: root,
			encoding: 'utf8'
		})
		expect(r.status, r.stderr).to.equal(0)
	}

	beforeEach(() => {
		hideGitEnv()
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-caps-git-'))
		git('init', '-q')
		fs.writeFileSync(`${root}/a.json`, '{"k":1}\n')
		git('add', '.')
		git('commit', '-q', '-m', 'one')
	})
	afterEach(() => {
		restoreGitEnv()
		fs.rmSync(root, { recursive: true, force: true })
	})

	it('resolves a commit-ish and not an unknown name or a blob', () => {
		const reader = gitReader(root)
		expect(reader.resolves('HEAD')).to.equal(true)
		expect(reader.resolves('origin/main')).to.equal(false)
		expect(reader.resolves('HEAD:a.json')).to.equal(false)
	})

	it('shows a file as committed, not as in the working tree', () => {
		const reader = gitReader(root)
		fs.writeFileSync(`${root}/a.json`, '{"k":2}\n')
		expect(reader.show('HEAD', 'a.json')).to.equal('{"k":1}\n')
	})

	it('answers undefined for a path the ref does not have', () => {
		expect(gitReader(root).show('HEAD', 'missing.json')).to.equal(undefined)
	})

	it('throws a CapsError, never "missing", when git itself fails', () => {
		expect(() => gitReader(root).show('no-such-ref', 'a.json')).to.throw(
			CapsError,
			'git ls-tree --name-only no-such-ref -- a.json failed'
		)
	})

	it('reads a file well past a kilobyte', () => {
		const big = JSON.stringify({ k: 'x'.repeat(200_000) })
		fs.writeFileSync(`${root}/big.json`, big)
		git('add', '.')
		git('commit', '-q', '-m', 'big')
		expect(gitReader(root).show('HEAD', 'big.json')).to.equal(big)
	})

	it('words a git failure without trailing whitespace', () => {
		expect(() => gitReader(root).show('no-such-ref', 'a.json'))
			.to.throw(CapsError)
			.that.satisfies((e: Error) => !/\s$/.test(e.message))
	})

	it('throws a CapsError carrying the spawn error when git cannot start', () => {
		const missing = path.join(root, 'no-such-dir')
		expect(() => gitReader(missing).show('HEAD', 'a.json')).to.throw(CapsError, 'failed')
	})
})
