// expect: koa-utils.path-traversal.local-helper-unsanitized-param
// Arrow form of the same hazard — the function-declaration pattern alone misses it.
import fs from 'fs-extra'
const writeIt = async (p: string, data: string) => {
	await fs.writeFile(p, data)
}
export async function bad(ctx: any) {
	await writeIt('/var/data/' + ctx.params.name, 'x')
}
