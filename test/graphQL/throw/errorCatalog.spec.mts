import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { GraphQLError } from 'graphql'

import { assertSnapshot } from '../../helpers/snapshot.mjs'

const ROOT = process.cwd()
const THROW_DIR = resolve(ROOT, 'dist', 'graphQL', 'throw')
const DOC = readFileSync(resolve(ROOT, 'docs', 'code', 'graphql-errors.md'), 'utf8')

// factories w/o default for required params → fixed probe args. All others called with zero args = their defaults
const PROBE_ARGS: Record<string, unknown[]> = {
	throwGraphQLError: [418, 'Probe title', 'Probe description'],
	throwErrorWrongUserInput: ['Probe message']
}

type Entry = { message: string; extensions: Record<string, unknown> }

const catalog = async (): Promise<Record<string, Entry>> => {
	const names = readdirSync(THROW_DIR)
		.filter((f) => f.endsWith('.mjs'))
		.map((f) => f.replace(/\.mjs$/, ''))
		.sort()
	const out: Record<string, Entry> = {}
	for (const name of names) {
		const mod = (await import(pathToFileURL(resolve(THROW_DIR, `${name}.mjs`)).href)) as Record<
			string,
			(...a: unknown[]) => never
		>
		const factory = mod[name]
		assert.equal(typeof factory, 'function', `${name}.mjs must export ${name}`)
		let caught: unknown
		try {
			factory?.(...(PROBE_ARGS[name] ?? []))
		} catch (e) {
			caught = e
		}
		assert.ok(caught instanceof GraphQLError, `${name} must throw GraphQLError`)
		out[name] = { message: caught.message, extensions: { ...caught.extensions } }
	}
	return out
}

// doc section of 1 helper: from its "## `name`" heading to next "## " heading
const docSection = (name: string): string => {
	const start = DOC.indexOf(`\n## \`${name}\`\n`)
	assert.ok(start >= 0, `docs/code/graphql-errors.md has no section for ${name}`)
	const next = DOC.indexOf('\n## ', start + 1)
	return DOC.slice(start, next === -1 ? undefined : next)
}

describe('graphQL/throw error catalog', () => {
	it('every throwXxx factory matches the committed snapshot (message + extensions)', async () => {
		assertSnapshot('graphql-errors.json', await catalog())
	})

	it('docs/code/graphql-errors.md quotes each status, title and description verbatim', async () => {
		const entries = await catalog()
		for (const [name, { message, extensions }] of Object.entries(entries)) {
			// primitive + probe-arg factories echo caller input, nothing fixed to quote
			if (name in PROBE_ARGS) continue
			const section = docSection(name)
			const status = (extensions['http'] as { status: number }).status
			const description = extensions['description'] as string
			assert.ok(section.includes(`${status}`), `${name}: status ${status} not in docs`)
			if (message !== '') assert.ok(section.includes(message), `${name}: title ${JSON.stringify(message)} not in docs`)
			// shared ERR_MISCONFIGURED copy quoted once in doc intro, not per section → description checked doc-wide
			if (description !== '') {
				assert.ok(DOC.includes(description), `${name}: description ${JSON.stringify(description)} not in docs`)
			}
		}
	})
})
