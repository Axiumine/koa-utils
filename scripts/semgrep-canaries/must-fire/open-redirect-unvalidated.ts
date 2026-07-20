// expect: koa-utils.open-redirect.unvalidated
export async function bad(ctx: any) {
	ctx.redirect(ctx.query.next)
}
