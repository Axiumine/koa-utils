// expect: koa-utils.path-traversal.unsanitized-param
import { reEncode } from '../stub'
export const mutation = {
	async resolve($parent: any, args: any) {
		return reEncode(args.filePath, 'jpeg')
	}
}
