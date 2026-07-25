import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { Next } from 'koa'

export const debugHandler = () => async (ctx: IContextRefresh, next: Next) => {
	return next()
}
