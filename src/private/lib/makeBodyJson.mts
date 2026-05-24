export function makeBodyJson(message: string, description: string) {
	return JSON.stringify({
		message,
		description
	})
}
