// expect: koa-utils.open-redirect.unvalidated
// The rule previously had no header/cookie source at all.
export async function bad(ctx: any) {
	ctx.redirect(ctx.request.header?.['x-return-to'])
}
