// expect: koa-utils.path-traversal.unsanitized-param
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const name = ctx.params.name
	const target = '/var/data/' + name
	await fs.readFile(target)
}
