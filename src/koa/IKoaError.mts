export interface IKoaError {
	extensions?: {
		http?: {
			status: number
		}
		description: string
	}
	status?: number
	body: {
		description: string
	}
	message: string
	path: string
	stack: string
}
