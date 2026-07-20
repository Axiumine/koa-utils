// expect: koa-utils.open-redirect.unvalidated
// An ad-hoc guard is no longer accepted as a sanitizer. Semgrep cannot evaluate what a
// regex admits, so "some regex was tested" is not evidence of safety — use the vetted
// isSafeRedirectTarget helper, whose strength is pinned by tests.
const ALLOW = /^\/x\/[a-zA-Z0-9._\-%/]+$/
export async function bad(ctx: any) {
	const link = ctx.query.next
	if (ALLOW.test(link)) {
		ctx.redirect(link)
	} else {
		ctx.redirect('/x/error')
	}
}
