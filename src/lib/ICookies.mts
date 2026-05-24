export type ICookies = {
	set(
		key: 'access_token' | 'refresh_token',
		value: string,
		options: Options,
	): void
	get(key: 'access_token' | 'refresh_token'): string | undefined
}
type Options = {
	httpOnly?: boolean
	sameSite?: string
	secure?: boolean
	path?: string
	expirationDate?: number
	maxAge?: number
}
