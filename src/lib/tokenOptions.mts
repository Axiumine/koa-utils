import * as dotenv from 'dotenv'

dotenv.config()

const baseOptions = {
	httpOnly: true,
	sameSite: 'Strict',
	secure: false, // rewrite a true in Nginx !
	expirationDate: 0
}

export const accessTokenOptions = {
	...baseOptions
	//  path: '/resource-api',
}
export const refreshTokenOptions = {
	...baseOptions
	//  path: '/authorization-api',
}
