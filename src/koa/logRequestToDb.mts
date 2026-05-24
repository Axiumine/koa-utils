import { OBJECTID_0_OBJ } from '@lib/Constants.mjs'
import { IContextLog } from '@private/graphQL/schema/context/IContextLog.mjs'
import { Next } from 'koa'

export async function logRequestToDb(ctx: IContextLog, next: Next) {
	// qui ${ctx.request.body?.operationName} è undefined
	const method = ctx.method
	console.debug(`${method} ${ctx.url}\n\r`)
	const start = Date.now()
	await next()

	const now = Date.now()
	const msTot = now - start

	const user = ctx.state.user?.id || OBJECTID_0_OBJ
	const operationName = ctx.request.body?.operationName
	const status = ctx.status
	console.debug(
		`${status} ${operationName} eseguita da ${user.toString()} - ${msTot}ms\n\r---------------`
	)

	// logGraphql(user, operationName, status, msTot)
}
