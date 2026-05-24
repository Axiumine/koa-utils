import bcrypt from '@node-rs/bcrypt'
import { SALT_ROUNDS } from '@private/lib/access/Constants.mjs'

export async function encryptPassword(pwd: string): Promise<string> {
	return await bcrypt.hash(pwd, SALT_ROUNDS)
}
