// expect: koa-utils.nosql-injection.mass-assignment-update-doc
// Computed key in the update document: attacker names the field to write.
export async function bad(ctx: any, User: any) {
	const field = ctx.request.body.field
	return User.findOneAndUpdate({ _id: 1 }, { $set: { [field]: ctx.request.body.value } })
}
