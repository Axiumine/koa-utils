// expect: koa-utils.nosql-injection.dynamic-filter-key
export async function bad(ctx: any, User: any) {
	const key = ctx.request.body.field
	return User.findOne({ _id: 1, [key]: ctx.request.body.value })
}
