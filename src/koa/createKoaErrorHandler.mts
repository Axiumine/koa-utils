import { IKoaErrorHandlerContext } from './IKoaErrorHandlerContext.mjs'
import { IKoaErrorHandlerOptions } from './IKoaErrorHandlerOptions.mjs'

/** Statuses that must not carry a body (RFC 9110). Copied into a `Set` per handler, never mutated. */
const NO_BODY_STATUSES: readonly number[] = [100, 101, 102, 204, 205, 304]

/** What the defaults read off a thrown value. A thrown `null`, `undefined`, string or number has neither field. */
type TErrorLike = { status?: number; message?: unknown } | null | undefined

// `||`, not `??`: status 0 and NaN must give 500 too
const defaultStatusOf = (err: unknown): number => (err as TErrorLike)?.status || 500

const defaultBodyOf = (err: unknown): unknown => ({ message: (err as TErrorLike)?.message })

/**
 * Builds a Koa error middleware: `await next()` in a `try`, and on a throw sets `ctx.status`, sets `ctx.body`, calls
 * `report`, then emits `'error'` on the app, all in one synchronous `catch` block so `emit` listeners see the final
 * context. It never rethrows what `next()` threw.
 *
 * Importing it loads no environment file, no Sentry, no `graphql` and no `koa`: it has no peer dependency.
 * `tdwKoaErrorHandler` is this factory configured for GraphQL errors, Sentry and dotenv.
 */
export function createKoaErrorHandler<TCtx extends IKoaErrorHandlerContext = IKoaErrorHandlerContext>(
	options?: IKoaErrorHandlerOptions<TCtx>
): (ctx: TCtx, next: () => Promise<unknown>) => Promise<void> {
	const statusOf = options?.statusOf ?? defaultStatusOf
	const bodyOf = options?.bodyOf ?? defaultBodyOf
	const report = options?.report
	const noBodyStatuses = new Set(options?.noBodyStatuses ?? NO_BODY_STATUSES)

	return async function koaErrorHandler(ctx, next) {
		try {
			await next()
		} catch (err: unknown) {
			ctx.status = statusOf(err, ctx)

			// Read back, not the value just assigned: Koa's setter can store a different number (it drops the body of 204/205/304)
			if (!noBodyStatuses.has(ctx.status)) {
				const body = bodyOf(err, ctx)
				if (body !== undefined) {
					ctx.body = body
				}
			}

			report?.(err, ctx)

			ctx.app.emit('error', err, ctx)
		}
	}
}
