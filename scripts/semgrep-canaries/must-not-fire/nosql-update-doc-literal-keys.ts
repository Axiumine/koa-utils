// safe: mirrors src/private/graphQL/schema/mutations/updateLoginStats4ever.mts —
// a typed object with fixed literal keys, passed as the $set value. This is the
// dominant safe idiom in this codebase; the mass-assignment rule must not flag it.
interface ISet {
	login?: { lastLogin?: Date }
}
export async function ok(id: any, User: any) {
	const dbSet: ISet = {}
	// @ts-expect-error avoid any
	dbSet['login.lastLogin'] = new Date()
	return User.updateOne({ _id: id }, { $set: dbSet }, { runValidators: true })
}
