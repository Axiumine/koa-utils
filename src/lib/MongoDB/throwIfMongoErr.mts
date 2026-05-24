import { IMongoDBError } from '@lib/MongoDB/IMongoDBError.mjs'
import { MongoDBErrType } from '@lib/MongoDB/MongoDBErrType.mjs'
import { throwConflictError } from '@throw/throwConflictError.mjs'
import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

export function throwIfMongoErr(e: IMongoDBError) {
	if (
		(e.errorResponse &&
			e.errorResponse.code === MongoDBErrType.DuplicateKeyError) ||
		(e.parent &&
			e.parent.errorResponse &&
			e.parent.errorResponse.code === MongoDBErrType.DuplicateKeyError)
	) {
		throw throwConflictError()
	} else if (e.message.startsWith('[Validator]')) {
		throw throwErrorWrongUserInput(e.message.replace('[Validator]', '').trim())
	}
}
