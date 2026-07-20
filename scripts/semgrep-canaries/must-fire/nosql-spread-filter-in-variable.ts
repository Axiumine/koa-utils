// expect: koa-utils.nosql-injection.object-spread-filter
export async function bad(ctx: any, User: any) {
	const filter = { ...ctx.request.body }
	return User.find(filter)
}
