// VULNERABLE, currently silent.
// ctx.cookies.get() is Koa's idiomatic cookie API and appears in no rule's
// pattern-sources; only ctx.request.header.cookie is modelled.
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const pref = ctx.cookies.get('theme')
	await fs.readFile('/var/themes/' + pref)
}
