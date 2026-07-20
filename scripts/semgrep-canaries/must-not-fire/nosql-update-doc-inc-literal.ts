// safe: mirrors src/private/lib/access/db/incReqTimes.mts
export async function ok(_id: any, User: any) {
	return User.updateOne({ _id }, { $inc: { 'account.email.requestTimes': 1 } }, { runValidators: true })
}
