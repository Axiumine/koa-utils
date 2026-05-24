import { EMAIL_HASH_LEN } from '@lib/Constants.mjs'
import { StringLib } from '@lib/StringLib.mjs'

export function emailHash() {
	const StrObj = new StringLib()
	return StrObj.randomString(EMAIL_HASH_LEN)
}
