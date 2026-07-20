// expect: koa-utils.nosql-injection.dynamic-filter-key
// Filter built in a local before the call — equally exploitable, and arguably the
// more natural way to write it than an inline literal.
export async function bad(ctx: any, User: any) {
	const filter = { _id: 1, [ctx.request.body.field]: ctx.request.body.value }
	return User.findOne(filter)
}
