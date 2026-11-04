/** True when the text holds an ASCII control character (code below 0x20, or 0x7f). */
function hasControlChar(text: string): boolean {
	for (const char of text) {
		const code = char.charCodeAt(0)
		if (code < 0x20 || code === 0x7f) return true
	}
	return false
}

/** True for an absolute POSIX path: starts with `/`, no `..` segment, no control character. */
export function isAbsolutePath(text: string): boolean {
	return text.startsWith('/') && !hasControlChar(text) && !text.split('/').includes('..')
}
