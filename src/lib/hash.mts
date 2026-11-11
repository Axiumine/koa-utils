import bcrypt from '@node-rs/bcrypt'

/**
 *
 * @param clear plaintext password
 * @param hash password hash
 */
export async function compareHashAsync(clear: string, hash: string) {
	return await bcrypt.compare(clear, hash)
}
