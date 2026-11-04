import type { IDbErrorFactory } from '@lib/PostgreSQL/error/IDbErrorFactory.mjs'
import sinon from 'sinon'

import { type AppError, appErrors } from './appErrors.mjs'

// appErrors wrapped in sinon spies → spec see which member got called + with how many args. Rest-spread keep argc: make(code) vs make(code, undefined) distinguishable
export function spiedErrors() {
	const is = sinon.spy(appErrors.is)
	const make = sinon.spy(appErrors.make)
	const internal = sinon.spy(appErrors.internal)
	const errors: IDbErrorFactory<AppError> = {
		is: (error): error is AppError => is(error),
		make: (...args) => make(...args),
		internal: (reason) => internal(reason)
	}
	return { errors, is, make, internal }
}
