// safe: mirrors src/koa/router/verifyEmail.mts anchored allowlist
const ALLOW = /^\/x\/[a-zA-Z0-9._\-%/]+$/
export async function ok(ctx: any) {
	const link = ctx.query.next
	if (ALLOW.test(link)) {
		ctx.redirect(link)
	} else {
		ctx.redirect('/x/error')
	}
}
