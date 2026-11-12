export interface IMongoDBError {
	errorResponse?: {
		code: number
	}
	parent?: {
		errorResponse?: {
			code: number
		}
	}
	message: string
}
