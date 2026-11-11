import { IMongoDBError } from '@lib/MongoDB/IMongoDBError.mjs'
import { MongoDBErrType } from '@lib/MongoDB/MongoDBErrType.mjs'
import { throwConflictError } from '@throw/throwConflictError.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

// The driver reports `code` as an open number: widening the catalogue entry keeps this a number-to-number comparison.
const DUPLICATE_KEY: number = MongoDBErrType.DuplicateKeyError

export function throwIfMongoErr(e: IMongoDBError) {
	if (
		(e.errorResponse && e.errorResponse.code === DUPLICATE_KEY) ||
		(e.parent && e.parent.errorResponse && e.parent.errorResponse.code === DUPLICATE_KEY)
	) {
		throw throwConflictError()
	} else if (e.message.startsWith('[Validator]')) {
		throw throwErrorWrongUserInput(e.message.replace('[Validator]', '').trim())
	}
}
