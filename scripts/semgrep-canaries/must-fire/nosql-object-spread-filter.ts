// expect: koa-utils.nosql-injection.object-spread-filter
export async function bad(ctx: any, User: any) {
	return User.find({ ...ctx.request.body })
}
