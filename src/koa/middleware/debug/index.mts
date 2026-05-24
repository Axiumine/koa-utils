import * as console from 'node:console'

import { IContextRefresh } from '@context/IContextRefresh.mjs'
import { Next } from 'koa'

export const debugHandler = () => async (ctx: IContextRefresh, next: Next) => {
	console.debug('[debugHandler]', new Date())
	console.debug('[debugHandler] ctx.request.header:', ctx.request.header)
	console.debug('[debugHandler] ctx.request.header.cookie:', ctx.request.header?.cookie)
	console.debug('[debugHandler] ctx.cookies[refresh_token]:', ctx.cookies.get('refresh_token'))

	return next()
}
