// safe: every filter key is a fixed literal; only values are dynamic
export async function ok(ctx: any, User: any) {
	return User.findOne({ email: ctx.request.body.email, deleted: false })
}
