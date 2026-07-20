// safe: generalized header source must still respect sanitizers — guards the
// accessor-shape change against becoming an unconditional-noise source.
import fs from 'fs-extra'
import path from 'path'
export async function ok(ctx: any) {
	const target = path.basename(ctx.request.header?.['x-target-path'])
	await fs.writeFile('/var/data/' + target, 'x')
}
