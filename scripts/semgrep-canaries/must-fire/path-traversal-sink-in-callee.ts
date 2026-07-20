// expect: koa-utils.path-traversal.local-helper-unsanitized-param
// Taint flows INTO a callee holding the sink. Semgrep OSS cannot track that flow, so
// the private helper itself is flagged for doing unsanitized fs work on a parameter.
import fs from 'fs-extra'
async function readIt(p: string) {
	await fs.readFile(p)
}
export async function bad(ctx: any) {
	const name = ctx.params.name
	await readIt('/var/data/' + name)
}
