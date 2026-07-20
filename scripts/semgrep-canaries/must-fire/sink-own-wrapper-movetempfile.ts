// expect: koa-utils.path-traversal.unsanitized-param
// This package's own path-taking wrapper, called with untrusted input in the same
// file. Semgrep OSS will not follow taint into moveTempFile's body, so the wrapper
// is named as a sink directly.
import { moveTempFile } from '../stub'
export async function bad(ctx: any) {
	const dest = ctx.params.filename
	return moveTempFile('/tmp/x', dest, '/var/data')
}
