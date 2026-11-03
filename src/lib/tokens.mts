import { randomUUID } from 'node:crypto'

export const REFRESH_TOKEN_EXPIRY = 90 * 24 * 60 * 60 // 90 days

// typed `string`, as uuid v4() was: randomUUID() returns a template literal type that would narrow every caller
function generateToken(): string {
	return randomUUID()
}

export function generateAccessToken() {
	return generateToken()
}

export function generateRefreshToken() {
	return generateToken()
}

export function accessTokenExpiry() {
	// Generate a random number between 0 (inclusive) and 1 (exclusive)
	// eslint-disable-next-line sonarjs/pseudo-random -- intentional 30-90 min expiry jitter, not a secret
	const random = Math.random() // nosemgrep: ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator -- 30-90 min expiry jitter, never a secret or token value
	// Scale it to the desired range (30 to 90)
	const scaledRandom = random * 61 // 90 - 30 + 1
	// Shift it to start from 30 and switch to minutes
	const shiftedRandom = (scaledRandom + 30) * 60
	// Floor the value to get an integer and return it
	return Math.floor(shiftedRandom)
}
