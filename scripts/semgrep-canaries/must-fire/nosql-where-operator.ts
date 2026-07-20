// expect: koa-utils.nosql-injection.where-operator
export async function bad(User: any) {
	return User.find({ $where: 'this.age > 18' })
}
