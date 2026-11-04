import type { IRolePool } from '@lib/PostgreSQL/role/IRolePool.mjs'

import { FakeTxWorld, type ITxCall } from './fakeTxPool.mjs'
import { EXPECTED_ROLE_SQL } from './roleCatalogSql.mjs'

// fake pool + model of catalog for assertRole specs. No socket, no server. Every statement recognised by EXACT text
// (golden copy in roleCatalogSql.mts) + exact arg count → a mutated SQL text or a moved $n = unknown statement → throw
// → assertRole answer CHECK_FAILED → spec red. Answers come from small model of catalog. Whether real server answer
// same = NOT proved here (integration test vs live PostgreSQL, outside this repo)

export type TRoleStatementKind = 'identity' | 'owns' | 'memberships' | 'schema' | 'function' | 'relation' | 'columns'

type TFlag = 'superuser' | 'createrole' | 'createdb' | 'bypassrls' | 'replication'

// what a grant check can answer besides plain true / false
export type THeldAnswer = boolean | null | 'no-row' | 'two-rows' | 'not-a-boolean' | 'null-row'

export interface IFakeCatalog {
	// current_user
	current: string
	// session_user. Default: current
	login?: string
	flags?: Partial<Record<TFlag, boolean>>
	owns?: boolean
	memberOf?: string[]
	// answers by key (see heldKey). Grant not listed = held
	held?: Map<string, THeldAnswer>
	// column-level check: rows the catalog gives. Default: every asked column, held
	columnsHeld?: (values: readonly unknown[]) => { name: string; held: boolean }[]
}

// exact text → kind. Texts are the golden copy, never src
const KIND_BY_TEXT = new Map<string, TRoleStatementKind>([
	[EXPECTED_ROLE_SQL.identity, 'identity'],
	[EXPECTED_ROLE_SQL.ownsObjects, 'owns'],
	[EXPECTED_ROLE_SQL.memberships, 'memberships'],
	[EXPECTED_ROLE_SQL.grant.schema, 'schema'],
	[EXPECTED_ROLE_SQL.grant.function, 'function'],
	[EXPECTED_ROLE_SQL.grant.relation, 'relation'],
	[EXPECTED_ROLE_SQL.grant.columns, 'columns']
])

// number of bound values per kind = highest $n of the golden text
const VALUE_COUNT: Record<TRoleStatementKind, number> = {
	identity: 0,
	owns: 0,
	memberships: 0,
	schema: 2,
	function: 2,
	relation: 2,
	columns: 3
}

// kind of statement. Unknown text, or wrong number of args / values → throw (spec red)
export function statementKind(call: ITxCall): TRoleStatementKind {
	const kind = KIND_BY_TEXT.get(call.text)
	if (kind === undefined) throw new Error('fake catalog: statement text is not one of the golden statements')
	const wanted = VALUE_COUNT[kind]
	// no values → 1-arg call. Values → 2-arg call
	if (call.argc !== (wanted === 0 ? 1 : 2) || (call.values?.length ?? 0) !== wanted) {
		throw new Error(`fake catalog: ${kind} statement called with the wrong arguments`)
	}
	return kind
}

// key of a grant in IFakeCatalog.held: 'schema:app:USAGE', 'relation:app.orders:SELECT', 'function:app.f:EXECUTE'
export function heldKey(kind: 'schema' | 'relation' | 'function', object: string, privilege: string): string {
	return `${kind}:${object}:${privilege}`
}

function answerOf(value: THeldAnswer | undefined): { rows: unknown[] } {
	if (value === undefined) return { rows: [{ held: true }] }
	if (value === 'no-row') return { rows: [] }
	if (value === 'two-rows') return { rows: [{ held: true }, { held: true }] }
	if (value === 'not-a-boolean') return { rows: [{ held: 't' }] }
	if (value === 'null-row') return { rows: [null] }
	return { rows: [{ held: value }] }
}

function identityRow(catalog: IFakeCatalog): Record<string, unknown> {
	const flags = catalog.flags ?? {}
	return {
		effective_role: catalog.current,
		login_role: catalog.login ?? catalog.current,
		superuser: flags.superuser ?? false,
		createrole: flags.createrole ?? false,
		createdb: flags.createdb ?? false,
		bypassrls: flags.bypassrls ?? false,
		replication: flags.replication ?? false
	}
}

type TAnswer = { rows: unknown[] }

// held answer of a grant check: model entry by key, grant not listed = held
function heldAnswer(
	catalog: IFakeCatalog,
	kind: 'schema' | 'relation' | 'function',
	object: string,
	privilege: string
): TAnswer {
	return answerOf((catalog.held ?? new Map<string, THeldAnswer>()).get(heldKey(kind, object, privilege)))
}

// answer per kind of statement. values = what the call bound
const ANSWERS: Record<TRoleStatementKind, (catalog: IFakeCatalog, values: readonly unknown[]) => TAnswer> = {
	identity: (catalog) => ({ rows: [identityRow(catalog)] }),
	owns: (catalog) => ({ rows: [{ owns: catalog.owns ?? false }] }),
	memberships: (catalog) => ({ rows: (catalog.memberOf ?? []).map((name) => ({ member_of: name })) }),
	columns: (catalog, values) => ({
		rows: catalog.columnsHeld ? catalog.columnsHeld(values) : (values[2] as string[]).map((name) => ({ name, held: true }))
	}),
	schema: (catalog, values) => heldAnswer(catalog, 'schema', String(values[0]), String(values[1])),
	function: (catalog, values) => heldAnswer(catalog, 'function', `${String(values[0])}.${String(values[1])}`, 'EXECUTE'),
	relation: (catalog, values) => heldAnswer(catalog, 'relation', String(values[0]), String(values[1]))
}

function respondFrom(catalog: IFakeCatalog, call: ITxCall): TAnswer {
	return ANSWERS[statementKind(call)](catalog, call.values ?? [])
}

// pool of the fake: connect as FakeTxWorld, end counts + can be made to fail
export class FakeRoleWorld extends FakeTxWorld {
	ended = 0
	// set → pool.end() reject with it
	endError: unknown
	// property a careless message could repeat: connection string. assertRole never get it
	readonly connectionString = 'postgres://app_role:planted-pool-secret@db.example.test:5432/appdb'

	private readonly state: { catalog: IFakeCatalog }

	constructor(catalog: IFakeCatalog) {
		const state = { catalog }
		super((call) => respondFrom(state.catalog, call))
		this.state = state
	}

	// model statements answered from. Spec may replace it between calls
	get catalog(): IFakeCatalog {
		return this.state.catalog
	}

	set catalog(catalog: IFakeCatalog) {
		this.state.catalog = catalog
	}

	readonly rolePool: IRolePool = {
		connect: () => this.pool.connect(),
		end: () => {
			this.ended += 1
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- world may reject with non-Error on purpose
			return this.endError === undefined ? Promise.resolve() : Promise.reject(this.endError)
		}
	}

	// kinds of the statements sent so far, in order
	get kinds(): TRoleStatementKind[] {
		return this.calls.map(statementKind)
	}
}
