// Pure measurement: source text in, list of cap violations out. No fs, no console.
import ts from 'typescript'

export type CapName = 'file-lines' | 'fn-lines' | 'class-lines' | 'params' | 'nesting'

export const LIMITS: Readonly<Record<CapName, number>> = {
	'file-lines': 500,
	'fn-lines': 50,
	'class-lines': 300,
	params: 4,
	nesting: 4
}

export interface Measurement {
	cap: CapName
	path: string
	symbol: string
	value: number
}

export const FILE_SYMBOL = '(file)'

const { SyntaxKind } = ts

// Lines holding at least one real token. Blank lines and comment-only lines do not count (same notion as ESLint
// skipBlankLines / skipComments); a multi-line template literal counts every line it spans.
function codeLineFlags(sf: ts.SourceFile): boolean[] {
	const flags: boolean[] = new Array<boolean>(sf.getLineStarts().length).fill(false)
	const mark = (node: ts.Node): void => {
		if (
			node.kind === SyntaxKind.EndOfFileToken ||
			(node.kind >= SyntaxKind.FirstJSDocNode && node.kind <= SyntaxKind.LastJSDocNode)
		) {
			return
		}
		const children = node.getChildren(sf)
		if (children.length > 0) {
			children.forEach(mark)
			return
		}
		const first = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
		const last = sf.getLineAndCharacterOfPosition(node.getEnd()).line
		for (let line = first; line <= last; line++) {
			flags[line] = true
		}
	}
	mark(sf)
	return flags
}

// prefix[i] = code lines among the first i lines, so any span is two lookups.
function prefixSums(flags: boolean[]): number[] {
	let total = 0
	const prefix = [0]
	for (const flag of flags) {
		total += Number(flag)
		prefix.push(total)
	}
	return prefix
}

type FunctionLike =
	| ts.FunctionDeclaration
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.MethodDeclaration
	| ts.ConstructorDeclaration
	| ts.GetAccessorDeclaration
	| ts.SetAccessorDeclaration

function isFunctionLike(node: ts.Node): node is FunctionLike {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isConstructorDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node)
	)
}

function isClassLike(node: ts.Node): node is ts.ClassDeclaration | ts.ClassExpression {
	return ts.isClassDeclaration(node) || ts.isClassExpression(node)
}

function isWrapper(node: ts.Node): boolean {
	return (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isNonNullExpression(node)
	)
}

// Name taken from where the node is assigned (`const x = ...`, `{ x: ... }`, `x = ...`), if it is.
function assignmentTarget(parent: ts.Node, child: ts.Node, sf: ts.SourceFile): string | undefined {
	if (
		(ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
		parent.initializer === child
	) {
		return parent.name.getText(sf)
	}
	if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === SyntaxKind.EqualsToken && parent.right === child) {
		return parent.left.getText(sf)
	}
	return undefined
}

// Name used when the node carries none: the assignment target, else `arg(callee)`, else `anon`.
function inferredName(node: ts.Node, sf: ts.SourceFile): string {
	// Skip parentheses and `as` / `satisfies` / non-null wrappers between the node and its context.
	let child: ts.Node = node
	let parent = node.parent
	while (isWrapper(parent)) {
		child = parent
		parent = parent.parent
	}
	const target = assignmentTarget(parent, child, sf)
	if (target !== undefined) {
		return target
	}
	if (ts.isCallExpression(parent) && parent.arguments.includes(child as ts.Expression)) {
		return `arg(${parent.expression.getText(sf)})`
	}
	return 'anon'
}

function symbolName(node: FunctionLike | ts.ClassDeclaration | ts.ClassExpression, sf: ts.SourceFile): string {
	if (ts.isConstructorDeclaration(node)) {
		return 'constructor'
	}
	if (ts.isGetAccessorDeclaration(node)) {
		return `get:${node.name.getText(sf)}`
	}
	if (ts.isSetAccessorDeclaration(node)) {
		return `set:${node.name.getText(sf)}`
	}
	return node.name?.getText(sf) ?? inferredName(node, sf)
}

const DEPTH_KINDS = new Set<ts.SyntaxKind>([
	SyntaxKind.IfStatement,
	SyntaxKind.ForStatement,
	SyntaxKind.ForInStatement,
	SyntaxKind.ForOfStatement,
	SyntaxKind.WhileStatement,
	SyntaxKind.DoStatement,
	SyntaxKind.SwitchStatement,
	SyntaxKind.TryStatement
])

// Deepest control-flow nesting inside ONE function (nested functions are their own entries). Mirrors ESLint max-depth:
// ternaries do not count and an `else if` stays on the level of the `if` it continues.
function maxNesting(fn: FunctionLike): number {
	let max = 0
	const visit = (node: ts.Node, depth: number): void => {
		if (isFunctionLike(node) || isClassLike(node)) {
			return
		}
		let next = depth
		if (DEPTH_KINDS.has(node.kind)) {
			next = depth + 1
			max = Math.max(max, next)
		}
		if (ts.isIfStatement(node) && node.elseStatement && ts.isIfStatement(node.elseStatement)) {
			visit(node.expression, next)
			visit(node.thenStatement, next)
			visit(node.elseStatement, depth)
			return
		}
		ts.forEachChild(node, (child) => visit(child, next))
	}
	ts.forEachChild(fn, (child) => visit(child, 0))
	return max
}

function paramCount(fn: FunctionLike): number {
	return fn.parameters.filter((p) => !(ts.isIdentifier(p.name) && p.name.text === 'this')).length
}

// Every function and class in `text` whose size exceeds a cap, plus the file itself. `path` is only a label (and the key part).
export function measureSource(path: string, text: string): Measurement[] {
	const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const flags = codeLineFlags(sf)
	const prefix = prefixSums(flags)
	const codeLines = (node: ts.Node): number => {
		const first = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line
		const last = sf.getLineAndCharacterOfPosition(node.getEnd()).line
		return prefix[last + 1]! - prefix[first]!
	}
	const out: Measurement[] = []
	const add = (cap: Measurement['cap'], symbol: string, value: number): void => {
		if (value > LIMITS[cap]) {
			out.push({ cap, path, symbol, value })
		}
	}
	add('file-lines', FILE_SYMBOL, prefix[prefix.length - 1]!)

	// One counter per symbol path, shared by every cap, so a key stays unique and stable under edits elsewhere.
	const seen = new Map<string, number>()
	const walk = (node: ts.Node, parentPath: string): void => {
		let here = parentPath
		if (isFunctionLike(node) || isClassLike(node)) {
			const base = parentPath === '' ? symbolName(node, sf) : `${parentPath}>${symbolName(node, sf)}`
			const n = (seen.get(base) ?? 0) + 1
			seen.set(base, n)
			here = n === 1 ? base : `${base}#${n}`
			if (isClassLike(node)) {
				add('class-lines', here, codeLines(node))
			} else {
				add('fn-lines', here, codeLines(node))
				add('params', here, paramCount(node))
				add('nesting', here, maxNesting(node))
			}
		}
		ts.forEachChild(node, (child) => walk(child, here))
	}
	walk(sf, '')
	return out
}
