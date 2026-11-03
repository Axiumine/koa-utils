// Memory-leak tripwire (yarn leak:check). Runs the built package through a few stateless scenarios and fails when the
// heap keeps growing per iteration after a forced gc. It is a regression tripwire, not a leak proof: it only covers
// code that needs no server (pure helpers, sharp re-encode, bcrypt). It imports the built dist, so run `yarn build` first.
// It is a measurement tool (like scripts/semgrep.sh), so it stays outside the c8 include and has no spec.
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')

const WARMUP_ITERATIONS = 50
// Per-iteration heap growth and total external (+ arrayBuffers) growth that still count as noise.
const MAX_HEAP_BYTES_PER_ITERATION = 256
// A scenario with very few iterations cannot resolve noise this small: a fixed ~800 B of promise and native binding
// bookkeeping, spread over 3 iterations, already reads ~260 B/iteration (identical with 1, 2 or 3 warm-ups).
const MAX_HEAP_BYTES_PER_ITERATION_FEW_RUNS = 1024
const MAX_EXTERNAL_BYTES = 1024 * 1024

interface Scenario {
	name: string
	iterations: number
	warmup: number
	maxHeapPerIteration: number
	run: () => unknown
}

interface Result {
	name: string
	iterations: number
	heapPerIteration: number
	maxHeapPerIteration: number
	externalDelta: number
	ok: boolean
}

async function load(relativePath: string): Promise<Record<string, any>> {
	return await import(pathToFileURL(join(DIST, relativePath)).href)
}

function collectGarbage(): void {
	// Two passes: the first one can leave weak callbacks and finalizers that free more on the second.
	globalThis.gc?.()
	globalThis.gc?.()
}

function snapshot() {
	collectGarbage()
	const { heapUsed, external, arrayBuffers } = process.memoryUsage()
	return { heapUsed, externalTotal: external + arrayBuffers }
}

async function measure(scenario: Scenario): Promise<Result> {
	for (let i = 0; i < scenario.warmup; i++) await scenario.run()
	const before = snapshot()
	for (let i = 0; i < scenario.iterations; i++) await scenario.run()
	const after = snapshot()
	const heapPerIteration = (after.heapUsed - before.heapUsed) / scenario.iterations
	const externalDelta = after.externalTotal - before.externalTotal
	const { maxHeapPerIteration } = scenario
	const ok = heapPerIteration < maxHeapPerIteration && externalDelta < MAX_EXTERNAL_BYTES
	return { name: scenario.name, iterations: scenario.iterations, heapPerIteration, maxHeapPerIteration, externalDelta, ok }
}

async function pureHelpers(): Promise<Scenario> {
	const { checkEmailLen } = await load('lib/checkEmailLen.mjs')
	const { checkPwdLen } = await load('lib/checkPwdLen.mjs')
	const { isValidUuidV4 } = await load('lib/isValidUuidV4.mjs')
	const { isSafeRedirectTarget } = await load('lib/isSafeRedirectTarget.mjs')
	const { emailHash } = await load('lib/emailHash.mjs')
	const { ArrayLib } = await load('lib/ArrayLib.mjs')
	const { NumLib } = await load('lib/NumLib.mjs')
	const { generateAccessToken, accessTokenExpiry } = await load('lib/tokens.mjs')
	const arrayLib = new ArrayLib()
	return {
		name: 'pure helpers',
		iterations: 3000,
		warmup: WARMUP_ITERATIONS,
		maxHeapPerIteration: MAX_HEAP_BYTES_PER_ITERATION,
		run: () => {
			checkEmailLen('user@example.com')
			checkPwdLen('a-long-enough-password')
			isValidUuidV4(generateAccessToken())
			isSafeRedirectTarget('/x/some/path?next=1')
			emailHash()
			arrayLib.arrDiff(['a', 'b', 'c'], ['b'])
			NumLib.parseFloatFixed('12,5')
			accessTokenExpiry()
		}
	}
}

// reEncodeToJpeg deletes its input and writes a sibling file, so each run recreates the PNG and removes the output.
async function sharpReEncode(workDir: string): Promise<Scenario> {
	const { default: sharp } = await import('sharp')
	const { reEncodeToJpeg } = await load('files/reEncodeToJpeg.mjs')
	const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
		.png()
		.toBuffer()
	return {
		name: 'sharp re-encode',
		iterations: 400,
		warmup: WARMUP_ITERATIONS,
		maxHeapPerIteration: MAX_HEAP_BYTES_PER_ITERATION,
		run: async () => {
			const source = join(workDir, 'image.png')
			await writeFile(source, png)
			const output: string = await reEncodeToJpeg(source)
			await rm(output)
		}
	}
}

// Cost 14 (SALT_ROUNDS) takes about a second per operation, so this scenario is capped at 3 iterations after 1 warm-up.
async function bcryptRoundTrip(): Promise<Scenario> {
	const { encryptPassword } = await load('lib/encryptPassword.mjs')
	const { compareHashAsync } = await load('lib/hash.mjs')
	return {
		name: 'bcrypt hash + compare',
		iterations: 3,
		warmup: 1,
		maxHeapPerIteration: MAX_HEAP_BYTES_PER_ITERATION_FEW_RUNS,
		run: async () => {
			const hash: string = await encryptPassword('a-long-enough-password')
			await compareHashAsync('a-long-enough-password', hash)
		}
	}
}

function preflight(): string | undefined {
	if (typeof globalThis.gc !== 'function') {
		return "gc is not exposed: run it as 'node --expose-gc scripts/leak-check.mts' (yarn leak:check)"
	}
	if (!existsSync(join(DIST, 'lib', 'hash.mjs'))) {
		return "dist/ is missing or incomplete: run 'yarn build' first"
	}
	return undefined
}

function report(results: Result[]): void {
	for (const r of results) {
		const status = r.ok ? 'ok  ' : 'FAIL'
		console.log(
			`${status} ${r.name.padEnd(24)} ${r.iterations} iterations, heap ${r.heapPerIteration.toFixed(1)} B/iteration` +
				` (max ${r.maxHeapPerIteration}), external ${r.externalDelta} B (max ${MAX_EXTERNAL_BYTES})`
		)
	}
}

async function main(): Promise<number> {
	const problem = preflight()
	if (problem) {
		console.error(`leak-check: ${problem}`)
		return 1
	}
	const workDir = await mkdtemp(join(tmpdir(), 'koa-utils-leak-'))
	try {
		const scenarios = [await pureHelpers(), await sharpReEncode(workDir), await bcryptRoundTrip()]
		const results: Result[] = []
		// Scenarios run one after the other on purpose: concurrent runs would blur each other's heap deltas.
		for (const scenario of scenarios) results.push(await measure(scenario))
		report(results)
		return results.every((r) => r.ok) ? 0 : 1
	} finally {
		await rm(workDir, { recursive: true, force: true })
	}
}

process.exitCode = await main()
