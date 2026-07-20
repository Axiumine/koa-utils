// expect: koa-utils.path-traversal.unsanitized-param
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const name = ctx.params.name
	await fs.appendFile('/var/log/' + name, 'x')
	await fs.copy('/tmp/src', '/var/data/' + name)
}
