// VULNERABLE, currently silent.
// All three NoSQL rules inspect only the FILTER argument. The update document
// (argument 2 / the $set value) has no coverage at all, so mass assignment —
// e.g. an attacker setting role/isAdmin — is entirely outside the ruleset.
export async function bad(ctx: any, User: any) {
	return User.updateOne({ _id: ctx.state.user.id }, { $set: { ...ctx.request.body } })
}
