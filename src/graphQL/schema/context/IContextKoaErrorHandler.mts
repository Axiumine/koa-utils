import { IKoaError } from '../../../koa/IKoaError.mjs'

export interface IContextKoaErrorHandler {
	status: number;
	body: {
		description?: string
		message: string
	},
	app: {
		emit(event: string, err: IKoaError, ctx: IContextKoaErrorHandler): void
	}
}
