export interface IContextLog {
	method: string
	url: string
	state: {
		user: {
			id: string
		}
	}
	request: {
		body?: {
			operationName: string
		}
	}
	status: number
}
