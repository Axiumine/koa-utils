// expect: koa-utils.open-redirect.unvalidated
// The exact weakening that previously passed both the scan and the full test suite.
// '//evil.com'.startsWith('/') === true — a protocol-relative open redirect.
export async function bad(ctx: any) {
	const link = ctx.query.next
	if (link.startsWith('/')) {
		ctx.redirect(link)
	} else {
		ctx.redirect('/x/error')
	}
}
