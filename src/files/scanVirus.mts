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

export async function scanVirus(filePath: string) {
	if (!clamScanInstance) {
		throw new Error('ClamScan has not been initialized. Call initClamScan first.')
	}

	try {
		const { isInfected, viruses } = await clamScanInstance.scanFile(filePath)

		if (isInfected) {
			Sentry.withScope((scope) => {
				scope.setTag('file', filePath)
				scope.setContext('viruses', { list: viruses, count: viruses.length })
				scope.setLevel('warning')
				Sentry.captureMessage(`Infected file detected: ${filePath}`)
			})
		} else {
			//console.log(`The file ${filePath} is clean.`)
		}
	} catch (e) {
		Sentry.captureException(e, {
			extra: { detail: `Error while scanning the file ${filePath}` }
		})
	}
}
