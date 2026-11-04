import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'

// stand-in for app error family: code + details. No cause
export class AppError extends Error {
	constructor(
		readonly code: string,
		readonly details?: unknown
	) {
		super(code)
		this.name = 'AppError'
	}
}

// factory of AppError. internal(reason) → code 'INTERNAL', details { reason }
export const appErrors: IDbErrorFactory<AppError> = {
	is: (error): error is AppError => error instanceof AppError,
	make: (code, details) => new AppError(code, details),
	internal: (reason) => new AppError('INTERNAL', { reason })
}
