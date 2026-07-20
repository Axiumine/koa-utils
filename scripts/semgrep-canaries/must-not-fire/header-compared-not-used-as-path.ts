// safe: mirrors authenticatedResourceHandler/index.mts:58 — a custom header read
// and compared against an env value never reaches a filesystem or redis sink.
export async function ok(ctx: any) {
	if (ctx.request.header?.['x-introspectioncode'] !== `${process.env.INTROSPECTION_CODE}`) {
		throw new Error('nope')
	}
	return true
}
