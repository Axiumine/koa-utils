import type { IPoolLogger } from '@lib/PostgreSQL/pool/IPoolLogger.mjs'

export interface ILogCall {
	readonly level: 'warn' | 'error'
	readonly message: string
	readonly fields: Readonly<Record<string, unknown>> | undefined
}

// logger of IPoolLogger shape, record every call. calls = raw → spec search fields for planted password
export function recordingLogger(): { logger: IPoolLogger; calls: ILogCall[] } {
	const calls: ILogCall[] = []
	const logger: IPoolLogger = {
		warn: (message, fields) => void calls.push({ level: 'warn', message, fields }),
		error: (message, fields) => void calls.push({ level: 'error', message, fields })
	}
	return { logger, calls }
}
