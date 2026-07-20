// expect: koa-utils.path-traversal.unsanitized-param
// fs.createWriteStream (namespaced) — only the bare createWriteStream was listed before.
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const name = ctx.params.name
	return fs.createWriteStream('/var/data/' + name)
}
