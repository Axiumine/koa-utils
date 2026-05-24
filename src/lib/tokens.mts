import { v4 as uuidv4 } from 'uuid'

export const REFRESH_TOKEN_EXPIRY = 90 * 24 * 60 * 60 // 90 days

function generateToken() {
	return uuidv4()
}

export function generateAccessToken() {
	return generateToken()
}

export function generateRefreshToken() {
	return generateToken()
}

export function accessTokenExpiry() {
	// Generate a random number between 0 (inclusive) and 1 (exclusive)
	const random = Math.random()
	// Scale it to the desired range (30 to 90)
	const scaledRandom = random * 61 // 90 - 30 + 1
	// Shift it to start from 30 and switch to minutes
	const shiftedRandom = (scaledRandom + 30) * 60
	// Floor the value to get an integer and return it
	return Math.floor(shiftedRandom)
}
