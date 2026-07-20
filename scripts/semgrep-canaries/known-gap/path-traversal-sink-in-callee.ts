// VULNERABLE, currently silent.
// Taint flows INTO a callee that holds the sink. Semgrep OSS does not follow it.
// (Taint through a helper's RETURN value does work — see must-fire/path-traversal-ctx-params.)
import fs from 'fs-extra'
async function readIt(p: string) {
	await fs.readFile(p)
}
export async function bad(ctx: any) {
	const name = ctx.params.name
	await readIt('/var/data/' + name)
}
