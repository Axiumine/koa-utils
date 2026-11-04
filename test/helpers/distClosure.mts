import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// relative specifier of a static import / export-from in built file
const RELATIVE = /(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g

// every dist file (path under dist/) reached by relative imports from entries, entries included. Input of copyDistToTemp
// → copy is whole closure, relative imports keep working, nothing else comes along
export function distClosure(entries: readonly string[]): string[] {
	const dist = resolve(process.cwd(), 'dist')
	const seen = new Set<string>()
	const todo = [...entries]
	for (let rel = todo.pop(); rel !== undefined; rel = todo.pop()) {
		if (seen.has(rel)) continue
		seen.add(rel)
		const text = readFileSync(join(dist, rel), 'utf8')
		for (const match of text.matchAll(RELATIVE)) {
			todo.push(relative(dist, resolve(dirname(join(dist, rel)), match[1] as string)))
		}
	}
	return [...seen].sort()
}
