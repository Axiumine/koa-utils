import { IContextLog } from '@private/graphQL/schema/context/IContextLog.mjs'
import { Next } from 'koa'

export async function logRequestToDb(ctx: IContextLog, next: Next) {
	await next()

	// logGraphql(user, operationName, status, msTot)
}
