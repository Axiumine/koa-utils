import { MongoDBErrType } from '@lib/MongoDB/MongoDBErrType.mjs'

export interface IMongoDBError {
	errorResponse?: {
		code: MongoDBErrType
	},
	parent?: {
		errorResponse?: {
			code: MongoDBErrType
		}
	},
	message: string
}
