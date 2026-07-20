// expect: koa-utils.path-traversal.unsanitized-param
// ctx.cookies.get() is Koa's idiomatic cookie API and is fully client-controlled.
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const pref = ctx.cookies.get('theme')
	await fs.readFile('/var/themes/' + pref)
}
