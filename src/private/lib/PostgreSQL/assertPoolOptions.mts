const APPLICATION_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,62}$/

interface IPoolNumbers {
	readonly max: number
	readonly applicationName: string
	readonly connectTimeoutMs: number
	readonly keepAliveInitialDelayMs: number
}

/**
 * Throws a `TypeError` for a parameter of `createPool` that is out of range, before anything is created. The checks
 * run in the order of the parameters.
 */
export function assertPoolOptions(options: IPoolNumbers): void {
	if (!Number.isInteger(options.max) || options.max < 1) throw new TypeError('max must be a whole number from 1')
	if (!APPLICATION_NAME.test(options.applicationName)) {
		throw new TypeError(
			'applicationName must be 1 to 63 characters of letters, digits, underscore, dot, colon and hyphen, starting with a letter or digit'
		)
	}
	if (!Number.isInteger(options.connectTimeoutMs) || options.connectTimeoutMs < 1) {
		throw new TypeError('connectTimeoutMs must be a whole number of milliseconds from 1')
	}
	if (!Number.isInteger(options.keepAliveInitialDelayMs) || options.keepAliveInitialDelayMs < 0) {
		throw new TypeError('keepAliveInitialDelayMs must be a whole number of milliseconds from 0')
	}
}
