import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect } from 'chai'

import { BASELINE_FILE, listSources, main, type Deps } from './cli.mts'

const FIVE_PARAMS = 'export function f(a: 1, b: 2, c: 3, d: 4, e: 5) {}\n'
const SIX_PARAMS = 'export function f(a: 1, b: 2, c: 3, d: 4, e: 5, g: 6) {}\n'
const FOUR_PARAMS = 'export function f(a: 1, b: 2, c: 3, d: 4) {}\n'
const KEY = 'params|src/a.mts|f'

let root = ''
let out: string[] = []
let err: string[] = []

const deps = (): Deps => ({ fs, log: (message) => out.push(message), error: (message) => err.push(message) })
const write = (rel: string, text: string): void => {
	fs.mkdirSync(path.dirname(`${root}/${rel}`), { recursive: true })
	fs.writeFileSync(`${root}/${rel}`, text)
}
const baseline = (): Record<string, number> => JSON.parse(fs.readFileSync(`${root}/${BASELINE_FILE}`, 'utf8'))
const run = (...args: string[]): number => main(args, root, deps())

describe('code caps cli', () => {
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-caps-'))
		out = []
		err = []
	})
	afterEach(() => {
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

		it('tolerates a root with neither src nor scripts', () => {
			expect(listSources(root, fs)).to.deep.equal([])
		})
	})

	describe('usage', () => {
		it('exits 2 on an unknown option or extra arguments', () => {
			expect(run('--nope')).to.equal(2)
			expect(run('--update', '--report')).to.equal(2)
			expect(err).to.have.length(2)
			expect(err[0]).to.contain('usage:')
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
			expect(err[0]).to.contain(`${BASELINE_FILE} is missing or invalid`)
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
			expect(err[0]).to.contain('missing or invalid')
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
			expect(run('--update')).to.equal(0)
			expect(baseline()).to.deep.equal({ [KEY]: 5 })
			expect(run()).to.equal(1)
		})

		it('fails closed without a baseline', () => {
			write('src/a.mts', FIVE_PARAMS)
			expect(run('--update')).to.equal(1)
			expect(fs.existsSync(`${root}/${BASELINE_FILE}`)).to.equal(false)
		})
	})

	describe('entry file', () => {
		it('scripts/check-code-caps.mts runs under Node type stripping and exits 2 on bad usage', () => {
			const entry = path.resolve(import.meta.dirname, '..', 'check-code-caps.mts')
			const result = spawnSync(process.execPath, [entry, '--bogus'], { encoding: 'utf8' })
			expect(result.status).to.equal(2)
			expect(result.stderr).to.contain('usage:')
		})
	})
})
