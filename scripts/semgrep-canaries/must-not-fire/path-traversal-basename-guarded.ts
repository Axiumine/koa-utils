// safe: path.basename strips traversal segments
import fs from 'fs-extra'
import path from 'path'
export async function ok(ctx: any) {
	const name = path.basename(ctx.params.name)
	await fs.readFile('/var/data/' + name)
}
