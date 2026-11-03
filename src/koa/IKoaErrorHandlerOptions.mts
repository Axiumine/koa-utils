import { IKoaErrorHandlerContext } from './IKoaErrorHandlerContext.mjs'

/* eslint-disable sonarjs/no-redundant-optional -- under exactOptionalPropertyTypes `?: T` rejects an explicit `undefined`, so `| undefined` is what lets a caller pass `{ report: maybeReport }` */

/**
 * Options of {@link createKoaErrorHandler}. Every field is optional; omitted, the handler behaves like
 * `tdwKoaErrorHandler` without GraphQL, Sentry or dotenv. `undefined` is accepted for each field
 * (`exactOptionalPropertyTypes`), so `{ report: maybeReport }` needs no conditional spread.
 */
export interface IKoaErrorHandlerOptions<TCtx extends IKoaErrorHandlerContext = IKoaErrorHandlerContext> {
	/**
	 * HTTP status for a caught value. Default `err?.status || 500`: a missing, `0` or `NaN` status gives 500.
	 * A truthy status outside 100-999 makes Koa's own `ctx.status` setter assert.
	 */
	statusOf?: ((err: unknown, ctx: TCtx) => number) | undefined
	/**
	 * Response body for a caught value, called after `ctx.status` is set and only when that status may carry a body.
	 * Default `{ message: err?.message }`. Returning `undefined` leaves `ctx.body` as it was; `null`, `''` and `0` are assigned.
	 */
	bodyOf?: ((err: unknown, ctx: TCtx) => unknown) | undefined
	/**
	 * Side effect for a caught value (logging, Sentry), called after status and body and before `'error'` is emitted.
	 * No default. Not wrapped in `try`/`catch`: a throwing `report` rejects the middleware and skips the `emit`.
	 */
	report?: ((err: unknown, ctx: TCtx) => void) | undefined
	/**
	 * Statuses that get no body (`bodyOf` is not called). Default `[100, 101, 102, 204, 205, 304]`. Copied into a `Set`
	 * when the handler is created, so changing the array afterwards has no effect. `[]` allows a body for every status.
	 */
	noBodyStatuses?: readonly number[] | undefined
}

/* eslint-enable sonarjs/no-redundant-optional -- end of the exactOptionalPropertyTypes block above */
