import { compare } from '@node-rs/bcrypt'

/**
 *
 * @param clear pwd in chiaro
 * @param hash hash della pwd
 */
export async function compareHashAsync(clear: string, hash: string) {
	try {
		return await compare(clear, hash)
	} catch (err) {
		throw err
	}
}
