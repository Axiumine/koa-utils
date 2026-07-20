// expect: koa-utils.path-traversal.unsanitized-param
// Any header name, not just authorization/cookie. Guards the accessor-shape source
// model against regressing to a header-name allowlist.
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const target = ctx.request.header?.['x-target-path']
	await fs.writeFile('/var/data/' + target, 'x')
}
