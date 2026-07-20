// expect: koa-utils.nosql-injection.mass-assignment-update-doc
// Attacker controls WHICH fields are written, not just their values.
export async function bad(ctx: any, User: any) {
	return User.updateOne({ _id: ctx.state.user.id }, { $set: { ...ctx.request.body } })
}
