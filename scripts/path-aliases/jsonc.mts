// Reads a tsconfig. Those files are JSONC: comments and trailing commas, which JSON.parse rejects. The TypeScript API is not
// used for this on purpose, the build must not depend on the compiler's JS API (TypeScript 7 does not ship it).
//
// Both passes match a string literal first and hand it back untouched, so the `/*` inside "./src/*" is never taken for the
// start of a comment, nor a `,` inside a string for a trailing comma.
const COMMENT = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g
const TRAILING_COMMA = /("(?:[^"\\]|\\.)*")|,(\s*[\]}])/g

export function parseJsonc(text: string): unknown {
	const withoutComments = text.replace(COMMENT, (_match, quoted: string | undefined) => quoted ?? '')
	return JSON.parse(
		withoutComments.replace(TRAILING_COMMA, (_match, quoted: string | undefined, tail: string) => quoted ?? tail)
	)
}
