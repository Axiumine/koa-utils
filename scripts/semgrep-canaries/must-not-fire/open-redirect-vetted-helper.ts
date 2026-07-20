// safe: mirrors src/koa/router/verifyEmail.mts — the only accepted guard.
import { isSafeRedirectTarget } from '../stub'
export async function ok(ctx: any) {
	const link = ctx.query.next
	if (isSafeRedirectTarget(link)) {
		ctx.redirect(link)
	} else {
		ctx.redirect('/x/error')
	}
}
