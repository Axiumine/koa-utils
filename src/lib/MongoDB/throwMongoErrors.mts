import { IMongoDBError } from '@lib/MongoDB/IMongoDBError.mjs'
import { throwIfMongoErr } from '@lib/MongoDB/throwIfMongoErr.mjs'
import * as Sentry from '@private/lib/sentry.mjs'
import { throwInternalError } from '@throw/throwInternalError.mjs'

export const throwMongoDBErrors = (e: IMongoDBError): never => {
	throwIfMongoErr(e)
	// else throw here

	Sentry.captureException(e)
	throw throwInternalError()
}
