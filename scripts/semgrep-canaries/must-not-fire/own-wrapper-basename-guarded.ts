// safe: wrapper sinks must still respect sanitizers.
import path from 'path'
import { moveTempFile } from '../stub'
export async function ok(ctx: any) {
	const dest = path.basename(ctx.params.filename)
	return moveTempFile('/tmp/x', dest, '/var/data')
}
