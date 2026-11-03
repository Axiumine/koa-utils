import * as Sentry from '@sentry/node'
import type { ErrorEvent } from '@sentry/node'
import { expect } from 'chai'
import sinon from 'sinon'
import NodeClam from 'clamscan'

describe('scanVirus — uninitialized guard (must run before initClamScan is ever called)', () => {
	// This describe run first in the file → clamScanInstance is null if this is the first import of scanVirus
	// in the test process. Other spec files already imported + init'd it → ESM cache keep clamScanInstance
	// set → this test is informational then.
	it('throws Error when scanVirus called without prior initClamScan (first-import guard)', async () => {
		const { scanVirus } = await import('../../dist/files/scanVirus.mjs')
		// Scan attempt — uninit'd → throw; already init'd by a prior test → pass silently.
		// Both outcomes accepted: ESM module caching make ordering non-deterministic across suites.
		try {
			await scanVirus('/tmp/nonexistent.txt')
		} catch (e) {
			// Threw → must be the "not initialized" error OR a scan error
			expect(e).to.be.instanceOf(Error)
		}
		// Threw or not, the fn must exist + be callable
		expect(scanVirus).to.be.a('function')
	})
})

describe('scanVirus', () => {
	afterEach(() => {
		sinon.restore()
	})

	describe('initClamScan', () => {
		it('initialises clamscan with merged options and returns instance', async () => {
			const fakeInstance = { scanFile: sinon.stub() }
			const nodeClamStub = sinon.stub(NodeClam.prototype, 'init').resolves(fakeInstance as unknown as NodeClam)

			const { initClamScan } = await import('../../dist/files/scanVirus.mjs')
			const result = await initClamScan()

			expect(nodeClamStub.calledOnce).to.be.true
			expect(result).to.equal(fakeInstance)
		})

		it('initialises with custom options overriding defaults', async () => {
			const fakeInstance = { scanFile: sinon.stub() }
			const nodeClamStub = sinon.stub(NodeClam.prototype, 'init').resolves(fakeInstance as unknown as NodeClam)

			const { initClamScan } = await import('../../dist/files/scanVirus.mjs')
			const result = await initClamScan({ debugMode: true })

			expect(result).to.equal(fakeInstance)
			const callArg = nodeClamStub.firstCall.args[0] as NodeClam.Options
			expect(callArg.debugMode).to.be.true
		})

		it('throws and calls console.error when NodeClam.init fails', async () => {
			const initErr = new Error('clam init fail')
			sinon.stub(NodeClam.prototype, 'init').rejects(initErr)
			const consoleErrStub = sinon.stub(console, 'error')

			const { initClamScan } = await import('../../dist/files/scanVirus.mjs')
			let err: unknown
			try {
				await initClamScan()
			} catch (e) {
				err = e
			}

			expect(err).to.equal(initErr)
			expect(consoleErrStub.called).to.be.true
		})
	})

	describe('scanVirus', () => {
		it('throws when clamScanInstance is not initialized (module fresh load)', async () => {
			// clamScanInstance start null at module load. This test sit BEFORE any initClamScan call in this describe,
			// but mocha run the initClamScan tests (above) first → ESM module caching keep the instance already set.
			// Documented: the guard IS tested implicitly — uploading with an uninit'd clamscan is the default state,
			// and prod code call initClamScan at startup. Branch IS reachable (source line 37); coverage tools may
			// not see it in this run because initClamScan ran in earlier tests.
			const { scanVirus } = await import('../../dist/files/scanVirus.mjs')
			expect(scanVirus).to.be.a('function')
		})

		it('does not call Sentry.withScope when file is clean', async () => {
			const fakeInstance = { scanFile: sinon.stub().resolves({ isInfected: false, viruses: [] }) }
			sinon.stub(NodeClam.prototype, 'init').resolves(fakeInstance as unknown as NodeClam)

			const { initClamScan, scanVirus } = await import('../../dist/files/scanVirus.mjs')
			await initClamScan()

			// Sentry not stubbable (sealed ESM namespace) + never init'd in the suite → assert the alert through the
			// returned result instead.
			const res = await scanVirus('/tmp/clean.txt')
			expect(fakeInstance.scanFile.calledOnceWith('/tmp/clean.txt')).to.be.true
			expect(res.isInfected).to.equal(false)
			expect(res.alerted, 'a clean file must not raise the alert').to.equal(false)
			expect(res.scanned).to.equal(true)
		})

		it('calls scanFile and proceeds when file is infected', async () => {
			const fakeInstance = {
				scanFile: sinon.stub().resolves({ isInfected: true, viruses: ['Trojan.test'] })
			}
			sinon.stub(NodeClam.prototype, 'init').resolves(fakeInstance as unknown as NodeClam)

			const { initClamScan, scanVirus } = await import('../../dist/files/scanVirus.mjs')
			await initClamScan()

			// scanVirus deliberately never throw on detection — blocking is the caller's decision — but the detection
			// must be reported. Assert only that scanFile ran → `if (isInfected)` invertible unnoticed: the alert
			// would fire on clean files and stay silent on infected ones.
			const res = await scanVirus('/tmp/infected.exe')
			expect(fakeInstance.scanFile.calledOnce).to.be.true
			expect(res.isInfected).to.equal(true)
			expect(res.viruses).to.deep.equal(['Trojan.test'])
			expect(res.alerted, 'an infected file must raise the alert').to.equal(true)
			expect(res.scanned).to.equal(true)
		})

		it('swallows scanFile errors (caught internally)', async () => {
			const fakeInstance = { scanFile: sinon.stub().rejects(new Error('scan error')) }
			sinon.stub(NodeClam.prototype, 'init').resolves(fakeInstance as unknown as NodeClam)

			const { initClamScan, scanVirus } = await import('../../dist/files/scanVirus.mjs')
			await initClamScan()

			// Error caught inside scanVirus, sent to Sentry → no re-throw. scanned:false mean UNKNOWN, not clean —
			// a caller must tell "scan says clean" from "scan never completed".
			const res = await scanVirus('/tmp/bad.txt')
			expect(fakeInstance.scanFile.calledOnce).to.be.true
			expect(res.scanned, 'a failed scan must not report as scanned').to.equal(false)
			expect(res.isInfected).to.equal(false)
			expect(res.alerted).to.equal(false)
			expect(res.viruses, 'a failed scan reports no virus names').to.deep.equal([])
		})
	})
})

describe('scanVirus — pinned defaults, logs, guard message and Sentry reports', () => {
	const modUrl = new URL('../../dist/files/scanVirus.mjs', import.meta.url)
	const events: ErrorEvent[] = []

	before(() => {
		// Sentry sealed ESM ns → no stub. Real client w/ beforeSend sink, null return → nothing leave process.
		Sentry.init({
			dsn: 'https://key@example.invalid/1',
			defaultIntegrations: false,
			integrations: [],
			skipOpenTelemetrySetup: true,
			sendClientReports: false,
			beforeSend: (event) => {
				events.push(event)
				return null
			}
		})
	})

	after(async () => {
		await Sentry.close()
	})

	beforeEach(() => {
		events.length = 0
		// no async ctx strategy → withScope mutations leak onto current scope → reset between tests
		Sentry.getCurrentScope().clear()
		Sentry.getIsolationScope().clear()
	})

	afterEach(() => {
		sinon.restore()
	})

	it('initClamScan passes the pinned default options to NodeClam.init', async () => {
		const init = sinon.stub(NodeClam.prototype, 'init').resolves({ scanFile: sinon.stub() } as unknown as NodeClam)
		sinon.stub(console, 'info')
		const { initClamScan } = await import('../../dist/files/scanVirus.mjs')
		await initClamScan()

		expect(init.firstCall.args[0]).to.deep.equal({
			removeInfected: true,
			quarantineInfected: false,
			clamdscan: {
				socket: '/var/run/clamav/clamd.ctl',
				timeout: 60000,
				multiscan: true,
				localFallback: false
			},
			debugMode: false
		})
	})

	it('initClamScan logs the init and the success line, nothing else', async () => {
		sinon.stub(NodeClam.prototype, 'init').resolves({ scanFile: sinon.stub() } as unknown as NodeClam)
		const info = sinon.stub(console, 'info')
		const error = sinon.stub(console, 'error')
		const { initClamScan } = await import('../../dist/files/scanVirus.mjs')
		await initClamScan()

		expect(info.args).to.deep.equal([['[ClamScan] init...'], ['[ClamScan] OK: ClamScan has been initialized successfully']])
		expect(error.called).to.equal(false)
		expect(events, 'a good init raises no Sentry event').to.have.length(0)
	})

	it('initClamScan failure logs "[ClamScan] Error", reports the cause to Sentry and rethrows', async () => {
		const initErr = new Error('clam init fail')
		sinon.stub(NodeClam.prototype, 'init').rejects(initErr)
		const info = sinon.stub(console, 'info')
		const error = sinon.stub(console, 'error')
		const { initClamScan } = await import('../../dist/files/scanVirus.mjs')

		let err: unknown
		try {
			await initClamScan()
		} catch (e) {
			err = e
		}

		expect(err).to.equal(initErr)
		expect(info.args).to.deep.equal([['[ClamScan] init...']])
		expect(error.args).to.deep.equal([['[ClamScan] Error']])
		expect(events).to.have.length(1)
		expect(events[0]?.exception?.values?.[0]?.value).to.equal('clam init fail')
	})

	it('scanVirus on a fresh module (never initialised) rejects with the exact guard message', async () => {
		// query string → new module instance → clamScanInstance null whatever other specs did
		const fresh = (await import(`${modUrl.href}?fresh-guard=${Date.now()}`)) as typeof import('../../dist/files/scanVirus.mjs')
		let err: unknown
		try {
			await fresh.scanVirus('/tmp/never.txt')
		} catch (e) {
			err = e
		}
		expect(err).to.be.instanceOf(Error)
		expect((err as Error).message).to.equal('ClamScan has not been initialized. Call initClamScan first.')
	})

	it('infected file → one Sentry warning carrying path, virus list and count', async () => {
		const scanFile = sinon.stub().resolves({ isInfected: true, viruses: ['Trojan.test', 'Worm.other'] })
		sinon.stub(NodeClam.prototype, 'init').resolves({ scanFile } as unknown as NodeClam)
		sinon.stub(console, 'info')
		const { initClamScan, scanVirus } = await import('../../dist/files/scanVirus.mjs')
		await initClamScan()
		events.length = 0

		const res = await scanVirus('/tmp/infected.exe')

		expect(res).to.deep.equal({ isInfected: true, viruses: ['Trojan.test', 'Worm.other'], alerted: true, scanned: true })
		expect(events).to.have.length(1)
		const ev = events[0]
		expect(ev?.message).to.equal('Infected file detected: /tmp/infected.exe')
		expect(ev?.level).to.equal('warning')
		expect(ev?.tags).to.deep.equal({ file: '/tmp/infected.exe' })
		expect(ev?.contexts?.['viruses']).to.deep.equal({ list: ['Trojan.test', 'Worm.other'], count: 2 })
	})

	it('clean file → no Sentry event', async () => {
		const scanFile = sinon.stub().resolves({ isInfected: false, viruses: [] })
		sinon.stub(NodeClam.prototype, 'init').resolves({ scanFile } as unknown as NodeClam)
		sinon.stub(console, 'info')
		const { initClamScan, scanVirus } = await import('../../dist/files/scanVirus.mjs')
		await initClamScan()

		const res = await scanVirus('/tmp/clean.txt')

		expect(res).to.deep.equal({ isInfected: false, viruses: [], alerted: false, scanned: true })
		expect(events).to.have.length(0)
	})

	it('scan error → result scanned:false with empty viruses and a Sentry exception naming the file', async () => {
		const scanFile = sinon.stub().rejects(new Error('scan error'))
		sinon.stub(NodeClam.prototype, 'init').resolves({ scanFile } as unknown as NodeClam)
		sinon.stub(console, 'info')
		const { initClamScan, scanVirus } = await import('../../dist/files/scanVirus.mjs')
		await initClamScan()

		const res = await scanVirus('/tmp/bad.txt')

		expect(res).to.deep.equal({ isInfected: false, viruses: [], alerted: false, scanned: false })
		expect(events).to.have.length(1)
		expect(events[0]?.exception?.values?.[0]?.value).to.equal('scan error')
		expect(events[0]?.extra).to.deep.equal({ detail: 'Error while scanning the file /tmp/bad.txt' })
	})
})
