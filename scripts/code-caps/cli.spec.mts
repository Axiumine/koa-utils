import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import { gitReader, type RefReader } from './against.mts'
import { BASELINE_FILE, listSources, main, type Deps } from './cli.mts'

const FIVE_PARAMS = 'export function f(a: 1, b: 2, c: 3, d: 4, e: 5) {}\n'
const SIX_PARAMS = 'export function f(a: 1, b: 2, c: 3, d: 4, e: 5, g: 6) {}\n'
const FOUR_PARAMS = 'export function f(a: 1, b: 2, c: 3, d: 4) {}\n'
const KEY = 'params|src/a.mts|f'

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

let root = ''
let out: string[] = []
let err: string[] = []

const deps = (over: Partial<Deps> = {}): Deps => ({
	fs,
	git: gitReader,
	log: (message) => out.push(message),
	error: (message) => err.push(message),
	...over
})
const write = (rel: string, text: string): void => {
	fs.mkdirSync(path.dirname(`${root}/${rel}`), { recursive: true })
	fs.writeFileSync(`${root}/${rel}`, text)
}
const baseline = (): Record<string, number> => JSON.parse(fs.readFileSync(`${root}/${BASELINE_FILE}`, 'utf8'))
const run = (...args: string[]): number => main(args, root, deps())
const runWith = (over: Partial<Deps>, ...args: string[]): number => main(args, root, deps(over))

describe('code caps cli', () => {
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-caps-'))
		hideGitEnv()
		out = []
		err = []
		fs.mkdirSync(`${root}/src`)
		fs.mkdirSync(`${root}/scripts`)
	})
	afterEach(() => {
		restoreGitEnv()
		fs.rmSync(root, { recursive: true, force: true })
	})

	describe('listSources', () => {
		it('lists .mts under src and scripts, sorted, skipping specs, semgrep-canaries, node_modules and other files', () => {
			for (const rel of [
				'src/b.mts',
				'src/a.mts',
				'src/deep/c.mts',
				'src/a.spec.mts',
				'src/readme.md',
				'src/node_modules/x.mts',
				'scripts/tool.mts',
				'scripts/semgrep-canaries/canary.mts',
				'test/t.mts',
				'other/o.mts'
			]) {
				write(rel, '')
			}
			expect(listSources(root, fs)).to.deep.equal(['src/a.mts', 'src/b.mts', 'src/deep/c.mts', 'scripts/tool.mts'])
		})

		it('returns [] for empty scope roots', () => {
			expect(listSources(root, fs)).to.deep.equal([])
		})

		it('sorts entries by name whatever order the directory lists them in', () => {
			const entry = (name: string, dir = false): unknown => ({
				name,
				isDirectory: () => dir,
				isSymbolicLink: () => false
			})
			const listing: Record<string, unknown[]> = {
				src: [entry('z.mts'), entry('sub', true), entry('a.mts'), entry('m.mts')],
				'src/sub': [entry('y.mts'), entry('b.mts')],
				scripts: [entry('t.mts')]
			}
			const fake = { readdirSync: (dir: string) => [...listing[dir.slice(root.length + 1)]!] } as never
			expect(listSources(root, fake)).to.deep.equal([
				'src/a.mts',
				'src/m.mts',
				'src/sub/b.mts',
				'src/sub/y.mts',
				'src/z.mts',
				'scripts/t.mts'
			])
		})

		it('fails closed when a scope root is missing', () => {
			fs.rmSync(`${root}/src`, { recursive: true })
			expect(() => listSources(root, fs)).to.throw('src/ cannot be read: ENOENT')
			expect(run()).to.equal(2)
			expect(err[0]).to.contain('src/ cannot be read')
			fs.mkdirSync(`${root}/src`)
			fs.rmSync(`${root}/scripts`, { recursive: true })
			expect(run('--report')).to.equal(2)
			expect(err[1]).to.contain('scripts/ cannot be read')
		})

		it('fails closed when a nested directory cannot be read', () => {
			write('src/sub/a.mts', FOUR_PARAMS)
			const denied = {
				...fs,
				readdirSync: (dir: string, opts: never) =>
					String(dir).endsWith('/sub') ? fs.readdirSync(`${dir}/nope`) : fs.readdirSync(dir, opts)
			} as never
			expect(runWith({ fs: denied }, '--report')).to.equal(2)
			expect(err[0]).to.contain('src/sub/ cannot be read: ENOENT')
		})

		it('refuses a symlinked directory, a symlinked file and a dangling .mts symlink', () => {
			write('outside/o.mts', FOUR_PARAMS)
			write('src/real.mts', FOUR_PARAMS)
			fs.symlinkSync(`${root}/outside`, `${root}/src/linkdir`)
			expect(() => listSources(root, fs)).to.throw('src/linkdir is a symlink')
			fs.rmSync(`${root}/src/linkdir`)
			fs.symlinkSync(`${root}/outside/o.mts`, `${root}/src/linkfile.mts`)
			expect(run()).to.equal(2)
			expect(err[0]).to.contain('src/linkfile.mts is a symlink')
			fs.rmSync(`${root}/src/linkfile.mts`)
			fs.symlinkSync('/nonexistent/dangling.mts', `${root}/src/dangling.mts`)
			expect(run('--report')).to.equal(2)
			expect(err[1]).to.contain('src/dangling.mts is a symlink')
			expect(out).to.deep.equal([])
		})

		it('fails closed when a listed file cannot be read', () => {
			write('src/a.mts', FOUR_PARAMS)
			const gone = {
				...fs,
				readFileSync: (file: string, enc: never) => fs.readFileSync(String(file).replace('a.mts', 'vanished.mts'), enc)
			} as never
			expect(runWith({ fs: gone }, '--report')).to.equal(2)
			expect(err[0]).to.contain('src/a.mts cannot be read: ENOENT')
		})
	})

	describe('syntax errors', () => {
		it('fails closed (exit 2) with file:line:col and never measures the broken file', () => {
			write('src/ok.mts', FIVE_PARAMS)
			write('src/bad.mts', 'export function ok() { return 1 }\nexport function broken( {\n  if (\n')
			write(BASELINE_FILE, JSON.stringify({ 'params|src/ok.mts|f': 5 }))
			expect(run()).to.equal(2)
			expect(err).to.have.length(1)
			expect(err[0]).to.contain("src/bad.mts:3:6: syntax error: ':' expected.")
			expect(out).to.deep.equal([])
			expect(run('--report')).to.equal(2)
			expect(run('--update')).to.equal(2)
			expect(run('--accept')).to.equal(2)
			expect(fs.readFileSync(`${root}/${BASELINE_FILE}`, 'utf8')).to.equal(JSON.stringify({ 'params|src/ok.mts|f': 5 }))
		})

		it('fails on a file with a single diagnostic', () => {
			write('src/one.mts', 'let x = ;\n')
			expect(run()).to.equal(2)
			expect(err).to.have.length(1)
			expect(err[0]?.split('\n')).to.have.length(1)
		})

		it('lists the errors of every broken file in one run', () => {
			write('src/b1.mts', 'const = 1\n')
			write('scripts/b2.mts', 'function (\n')
			expect(run()).to.equal(2)
			expect(err[0]).to.contain('src/b1.mts:1')
			expect(err[0]).to.contain('scripts/b2.mts:1')
		})
	})

	describe('usage', () => {
		it('exits 2 on an unknown option or extra arguments', () => {
			expect(run('--nope')).to.equal(2)
			expect(run('--update', '--report')).to.equal(2)
			expect(run('--against', 'a', 'b')).to.equal(2)
			expect(run('--report', 'x')).to.equal(2)
			expect(err).to.have.length(4)
			expect(err[0]).to.contain('usage:')
		})

		it('rethrows an error that is not a CapsError', () => {
			write('src/a.mts', FOUR_PARAMS)
			const boom = (): never => {
				throw new TypeError('not mine')
			}
			expect(() => runWith({ log: boom }, '--report')).to.throw(TypeError, 'not mine')
		})
	})

	describe('check (default)', () => {
		it('exits 0 when nothing is over a cap and the baseline is empty', () => {
			write('src/a.mts', FOUR_PARAMS)
			write(BASELINE_FILE, '{}')
			expect(run()).to.equal(0)
			expect(out[0]).to.contain('code caps ok')
		})

		it('tolerates a baselined violation at the same value', () => {
			write('src/a.mts', FIVE_PARAMS)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			expect(run()).to.equal(0)
			expect(err).to.deep.equal([])
		})

		it('fails on a new violation and names it', () => {
			write('src/a.mts', FIVE_PARAMS)
			write(BASELINE_FILE, '{}')
			expect(run()).to.equal(1)
			expect(err).to.deep.equal(['NEW   params src/a.mts f 5>4 (not in baseline: fix the code, do not baseline new debt)'])
		})

		it('fails when a baselined violation grew', () => {
			write('src/a.mts', SIX_PARAMS)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			expect(run()).to.equal(1)
			expect(err[0]).to.match(/^GROWN params src\/a\.mts f 6>4 \(baseline 5/)
		})

		it('fails as STALE when a baselined violation shrank or vanished', () => {
			write('src/a.mts', FOUR_PARAMS)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			expect(run()).to.equal(1)
			expect(err[0]).to.equal('STALE params src/a.mts f gone (baseline 5): run yarn caps:update')
		})

		it('is not moved by edits elsewhere in the file', () => {
			write('src/a.mts', `// header\n\n\n${FIVE_PARAMS}`)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			expect(run()).to.equal(0)
		})

		it('fails closed when the baseline is missing, even with no violations', () => {
			write('src/a.mts', FOUR_PARAMS)
			expect(run()).to.equal(1)
			expect(err[0]).to.contain(`${BASELINE_FILE} cannot be read: ENOENT`)
			expect(err[0]).to.contain(`git checkout -- ${BASELINE_FILE}`)
			expect(err[0]).to.not.contain('--accept')
		})

		it('fails closed and lists every violation as new when the baseline is missing', () => {
			write('src/a.mts', FIVE_PARAMS)
			expect(run()).to.equal(1)
			expect(err[1]).to.match(/^NEW {3}params src\/a\.mts f 5>4/)
		})

		it('fails closed on a corrupt baseline', () => {
			write('src/a.mts', FIVE_PARAMS)
			write(BASELINE_FILE, '{ not json')
			expect(run()).to.equal(1)
			expect(err[0]).to.contain(`${BASELINE_FILE} is invalid: `)
			expect(err[0]).to.contain('JSON')
			expect(err[0]).to.not.contain('--accept')
			expect(err[1]).to.match(/^NEW {3}params src\/a\.mts f 5>4/)
		})

		it('prints the validation error of a well-formed but wrong baseline', () => {
			write('src/a.mts', FOUR_PARAMS)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 0 }))
			expect(run()).to.equal(1)
			expect(err[0]).to.contain(`baseline value for ${KEY} must be a positive integer`)
			write(BASELINE_FILE, '[]')
			expect(run('--update')).to.equal(1)
			expect(err[1]).to.contain('baseline must be a JSON object')
		})
	})

	describe('--report', () => {
		it('lists every violation and exits 0 regardless of the baseline', () => {
			write('src/a.mts', FIVE_PARAMS)
			expect(run('--report')).to.equal(0)
			expect(out).to.deep.equal(['params src/a.mts f 5>4', '1 cap violation(s)'])
		})
	})

	describe('--accept', () => {
		it('writes the full snapshot, singular and plural', () => {
			write('src/a.mts', FIVE_PARAMS)
			expect(run('--accept')).to.equal(0)
			expect(baseline()).to.deep.equal({ [KEY]: 5 })
			expect(out[0]).to.contain('1 entry')
			write('src/b.mts', FIVE_PARAMS)
			expect(run('--accept')).to.equal(0)
			expect(out[1]).to.contain('2 entries')
			expect(run()).to.equal(0)
		})
	})

	describe('--update', () => {
		it('lowers a shrunk value and drops a vanished key', () => {
			write('src/a.mts', FIVE_PARAMS)
			write('src/b.mts', 'export function g(a: 1, b: 2, c: 3, d: 4, e: 5, g: 6, h: 7) {}\n')
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 6, 'params|src/b.mts|g': 9, 'params|src/c.mts|gone': 5 }))
			expect(run('--update')).to.equal(0)
			expect(baseline()).to.deep.equal({ [KEY]: 5, 'params|src/b.mts|g': 7 })
			expect(out[0]).to.contain('3 -> 2')
			expect(run()).to.equal(0)
		})

		it('never raises a value and never adds a key', () => {
			write('src/a.mts', SIX_PARAMS)
			write('src/b.mts', FIVE_PARAMS)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			expect(run('--update')).to.equal(1)
			expect(baseline()).to.deep.equal({ [KEY]: 5 })
			expect(err[0]).to.match(/^NEW {3}params src\/b\.mts f 5>4/)
			expect(err[1]).to.match(/^GROWN params src\/a\.mts f 6>4/)
			expect(err[2]).to.contain('violations remain')
			expect(out[0]).to.contain('1 -> 1')
			expect(run()).to.equal(1)
		})

		it('exits 0 and says nothing about leftovers when the lowered baseline is clean', () => {
			write('src/a.mts', FIVE_PARAMS)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			expect(run('--update')).to.equal(0)
			expect(err).to.deep.equal([])
		})

		it('fails closed without a baseline', () => {
			write('src/a.mts', FIVE_PARAMS)
			expect(run('--update')).to.equal(1)
			expect(fs.existsSync(`${root}/${BASELINE_FILE}`)).to.equal(false)
		})
	})

	describe('--against', () => {
		const KEEP = JSON.stringify({ [KEY]: 5 })
		const fakeGit = (files: Record<string, string>, resolvable = true): ((dir: string) => RefReader) => {
			return () => ({ resolves: () => resolvable, show: (_ref, file) => files[file] })
		}

		it('exits 0 when both files are no looser than the ref (equal, lower, removed)', () => {
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 5 }))
			write('eslint-suppressions.json', JSON.stringify({ 'src/x.mts': { rule: { count: 2 } } }))
			const git = fakeGit({
				[BASELINE_FILE]: JSON.stringify({ [KEY]: 6, 'params|src/gone.mts|g': 9 }),
				'eslint-suppressions.json': JSON.stringify({ 'src/x.mts': { rule: { count: 2 }, other: { count: 1 } } })
			})
			expect(runWith({ git }, '--against')).to.equal(0)
			expect(out[0]).to.contain('no looser than origin/main')
		})

		it('fails on a new key and on a higher value, in either file, naming file and key', () => {
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 6, 'params|src/b.mts|g': 5 }))
			write(
				'eslint-suppressions.json',
				JSON.stringify({ 'src/x.mts': { rule: { count: 3 }, fresh: { count: 1 } }, 'src/y.mts': { rule: { count: 1 } } })
			)
			const git = fakeGit({
				[BASELINE_FILE]: KEEP,
				'eslint-suppressions.json': JSON.stringify({ 'src/x.mts': { rule: { count: 2 } } })
			})
			expect(runWith({ git }, '--against', 'refs/heads/main')).to.equal(1)
			expect(err).to.deep.equal([
				`HIGHER ${BASELINE_FILE}: ${KEY} = 6 (refs/heads/main has 5: shrink it back)`,
				`NEW    ${BASELINE_FILE}: params|src/b.mts|g = 5 (not in refs/heads/main: fix the code, do not add debt)`,
				'HIGHER eslint-suppressions.json: src/x.mts > rule > count = 3 (refs/heads/main has 2: shrink it back)',
				'NEW    eslint-suppressions.json: src/x.mts > fresh > count = 1 (not in refs/heads/main: fix the code, do not add debt)',
				'NEW    eslint-suppressions.json: src/y.mts > rule > count = 1 (not in refs/heads/main: fix the code, do not add debt)'
			])
		})

		it('allows a file the ref does not have at all (first introduction), but still checks the other', () => {
			write(BASELINE_FILE, KEEP)
			write('eslint-suppressions.json', JSON.stringify({ 'src/x.mts': { rule: { count: 2 } } }))
			expect(runWith({ git: fakeGit({}) }, '--against')).to.equal(0)
			expect(runWith({ git: fakeGit({ [BASELINE_FILE]: '{}' }) }, '--against')).to.equal(1)
			expect(err[0]).to.contain(`NEW    ${BASELINE_FILE}`)
		})

		it('ignores a ratchet file that is absent from the working tree', () => {
			expect(runWith({ git: fakeGit({ [BASELINE_FILE]: KEEP }) }, '--against')).to.equal(0)
		})

		it('fails closed (exit 2) with the fixing command when the ref does not resolve', () => {
			write(BASELINE_FILE, KEEP)
			expect(runWith({ git: fakeGit({}, false) }, '--against')).to.equal(2)
			expect(err).to.deep.equal([
				'cannot resolve origin/main: the ratchet comparison cannot run. Fix it with: git fetch origin main'
			])
		})

		it('fails closed on malformed JSON in the working tree or in the ref', () => {
			write(BASELINE_FILE, '{ nope')
			expect(runWith({ git: fakeGit({ [BASELINE_FILE]: KEEP }) }, '--against')).to.equal(2)
			expect(err[0]).to.contain(`${BASELINE_FILE} is not valid JSON`)
			write(BASELINE_FILE, KEEP)
			expect(runWith({ git: fakeGit({ [BASELINE_FILE]: '{ nope' }) }, '--against')).to.equal(2)
			expect(err[1]).to.contain(`origin/main:${BASELINE_FILE} is not valid JSON`)
		})

		it('rejects an unsafe ref as bad usage', () => {
			expect(run('--against', '--upload-pack=evil')).to.equal(2)
			expect(err).to.have.length(1)
			expect(err[0]).to.contain('unsafe ref: --upload-pack=evil')
		})

		it('works against a real git repo: resolves HEAD, rejects a grown baseline, reports an unknown ref', () => {
			const git = (...args: string[]): void => {
				const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
					cwd: root,
					encoding: 'utf8'
				})
				expect(r.status, r.stderr).to.equal(0)
			}
			write(BASELINE_FILE, KEEP)
			git('init', '-q')
			git('add', '.')
			git('commit', '-q', '-m', 'base')
			expect(run('--against', 'HEAD')).to.equal(0)
			write(BASELINE_FILE, JSON.stringify({ [KEY]: 6 }))
			expect(run('--against', 'HEAD')).to.equal(1)
			expect(err[0]).to.contain('HIGHER')
			expect(run('--against', 'origin/main')).to.equal(2)
			expect(err[1]).to.contain('git fetch origin main')
		})
	})

	describe('entry file', () => {
		const entry = path.resolve(import.meta.dirname, '..', 'check-code-caps.mts')

		it('scripts/check-code-caps.mts runs under Node type stripping and exits 2 on bad usage', () => {
			const result = spawnSync(process.execPath, [entry, '--bogus'], { encoding: 'utf8' })
			expect(result.status).to.equal(2)
			expect(result.stderr).to.contain('usage:')
		})

		it('resolves the repo root from its own location, so the real tree and baseline are read', () => {
			const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', cwd: os.tmpdir() })
			expect(result.stderr).to.not.contain('cannot be read')
			expect(result.stdout).to.contain('code caps ok')
			expect(result.status).to.equal(0)
		})
	})
})
