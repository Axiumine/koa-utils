// VULNERABLE, currently silent.
// All three NoSQL rules require an INLINE object literal at the call site.
// Building the same filter in a local variable first escapes every one of them.
export async function bad(ctx: any, User: any) {
	const filter = { _id: 1, [ctx.request.body.field]: ctx.request.body.value }
	return User.findOne(filter)
}
