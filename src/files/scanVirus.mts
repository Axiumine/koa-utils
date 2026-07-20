import * as Sentry from '@sentry/node'
import NodeClam from 'clamscan'

let clamScanInstance: NodeClam | null = null

/**********
 * Call inside koa initialization
 */
export async function initClamScan(options?: Partial<NodeClam.Options>) {
	const defaultOptions: NodeClam.Options = {
		removeInfected: true,
		quarantineInfected: false,
		clamdscan: {
			socket: '/var/run/clamav/clamd.ctl',
			timeout: 60000,
			multiscan: true,
			localFallback: false
		},
		debugMode: false
	}
	console.info('[ClamScan] init...')

	try {
		const mergedOptions = { ...defaultOptions, ...options }
		clamScanInstance = await new NodeClam().init(mergedOptions)
		console.info('[ClamScan] OK: ClamScan has been initialized successfully')
		return clamScanInstance
	} catch (e) {
		console.error('[ClamScan] Error')
		Sentry.captureException(e)
		throw e
	}
}

/**
 * Result of a virus scan.
 *
 * Returned rather than kept internal because the Sentry alert used to be the ONLY
 * effect of detecting an infected file: inverting `if (isInfected)` had no observable
 * consequence, so no test could pin it (@sentry/node is a sealed ES module namespace
 * and is never initialised in the suite, making captureMessage a silent no-op there).
 * `alerted` is set inside the branch precisely so the branch itself is observable.
 *
 * scanVirus still never throws on detection — blocking remains the caller's decision —
 * but the caller now has something to decide with. Note `scanned: false` means the scan
 * did not complete: treat it as unknown, not as clean.
 */
export interface IScanVirusResult {
	/** true when ClamAV reported the file as infected */
	isInfected: boolean
	/** virus names reported by ClamAV; empty when clean or when the scan failed */
	viruses: string[]
	/** true when the infected-file alert was raised */
	alerted: boolean
	/** false when the scan itself errored — the result is unknown, NOT clean */
	scanned: boolean
}

export async function scanVirus(filePath: string): Promise<IScanVirusResult> {
	if (!clamScanInstance) {
		throw new Error('ClamScan has not been initialized. Call initClamScan first.')
	}

	try {
		const { isInfected, viruses } = await clamScanInstance.scanFile(filePath)

		let alerted = false
		if (isInfected) {
			alerted = true
			Sentry.withScope((scope) => {
				scope.setTag('file', filePath)
				scope.setContext('viruses', { list: viruses, count: viruses.length })
				scope.setLevel('warning')
				Sentry.captureMessage(`Infected file detected: ${filePath}`)
			})
		} else {
			//console.log(`The file ${filePath} is clean.`)
		}

		return { isInfected, viruses, alerted, scanned: true }
	} catch (e) {
		Sentry.captureException(e, {
			extra: { detail: `Error while scanning the file ${filePath}` }
		})
		return { isInfected: false, viruses: [], alerted: false, scanned: false }
	}
}
