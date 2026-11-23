// Turns tsconfig path aliases (`@lib/x.mjs`) into relative specifiers (`../lib/x.mjs`) in one emitted file.
//
// Only the module-specifier position of a file is touched (see scan.mts), and only when the specifier starts with an alias
// prefix, so `@sentry/node`, `@node-rs/bcrypt` or `@types/*` pass through. A rewritten specifier is always double-quoted: that
// is how the compiler printed it back when a transformer plugin did this job, and the published bytes must not change.
import path from 'node:path'

import { scanSpecifiers } from './scan.mts'

export interface Alias {
	// What the specifier starts with, e.g. `@lib/`.
	prefix: string
	// Absolute posix directory the prefix stands for, in the emitted tree (not in src/).
	dir: string
}

// `./x.mjs` or `../lib/x.mjs`: a relative specifier always starts with a dot segment, Node resolves a bare `x.mjs` as a package.
export function relativeSpecifier(fileDir: string, target: string): string {
	const relative = path.posix.relative(fileDir, target)
	return relative.startsWith('../') ? relative : `./${relative}`
}

function rewriteBody(body: string, fileDir: string, aliases: readonly Alias[]): string | undefined {
	const alias = aliases.find((candidate) => body.startsWith(candidate.prefix))
	if (alias === undefined) {
		return undefined
	}
	const rest = body.slice(alias.prefix.length)
	// The result is written between double quotes without escaping, so a character that would need one is refused, not mangled.
	if (/["\\]/.test(rest)) {
		throw new Error(`cannot rewrite ${body}: a quote or a backslash in a specifier is not supported`)
	}
	return relativeSpecifier(fileDir, path.posix.join(alias.dir, rest))
}

export function rewriteAliasSpecifiers(text: string, fileDir: string, aliases: readonly Alias[]): string {
	let out = ''
	let copied = 0
	for (const { start, end, body } of scanSpecifiers(text)) {
		const next = rewriteBody(body, fileDir, aliases)
		if (next !== undefined) {
			out += `${text.slice(copied, start)}"${next}"`
			copied = end
		}
	}
	return out + text.slice(copied)
}
