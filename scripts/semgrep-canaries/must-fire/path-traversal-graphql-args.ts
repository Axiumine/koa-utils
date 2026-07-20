// expect: koa-utils.path-traversal.unsanitized-param
import fs from 'fs-extra'
export const mutation = {
	async resolve($parent: any, args: any) {
		await fs.remove('/var/data/' + args.filename)
	}
}
