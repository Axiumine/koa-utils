/**
 * The part of a Koa context that {@link createKoaErrorHandler} reads and writes. Koa's `ParameterizedContext` and
 * `IContextKoaErrorHandler` both fit it, so the factory needs no `koa` types and no peer at all.
 */
export interface IKoaErrorHandlerContext {
	status: number
	body: unknown
	// Method syntax on purpose: method parameters are bivariant, so a context whose `emit` is typed with a narrower
	// error or context type (`IContextKoaErrorHandler`) still satisfies this one.
	app: { emit(event: string, err: unknown, ctx: unknown): unknown }
}
