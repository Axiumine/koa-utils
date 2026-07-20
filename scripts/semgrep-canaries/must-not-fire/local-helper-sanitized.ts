// safe: private helper that sanitizes its own parameter before the fs call.
import fs from 'fs-extra'
import path from 'path'
async function readIt(p: string) {
	await fs.readFile('/var/data/' + path.basename(p))
}
export async function ok(ctx: any) {
	await readIt(ctx.params.name)
}
