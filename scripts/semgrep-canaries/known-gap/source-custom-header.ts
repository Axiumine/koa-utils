// VULNERABLE, currently silent.
// Header sources are enumerated as the literal names 'authorization' and 'cookie'.
// Any other header name is a different pattern and never matches — even though
// src/koa/middleware/authenticatedResourceHandler/index.mts:58 already reads
// ctx.request.header?.['x-introspectioncode'] with this exact accessor shape.
import fs from 'fs-extra'
export async function bad(ctx: any) {
	const target = ctx.request.header?.['x-target-path']
	await fs.writeFile('/var/data/' + target, 'x')
}
