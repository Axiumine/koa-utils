import { buildConstraintEntry } from '@lib/PostgreSQL/error/buildConstraintEntry.mjs'
import type { IConstraintEntry } from '@lib/PostgreSQL/error/IConstraintEntry.mjs'
import type { IConstraintEntryBuilder } from '@lib/PostgreSQL/error/IConstraintEntryBuilder.mjs'
import type { IConstraintTable } from '@lib/PostgreSQL/error/IConstraintTable.mjs'
import { lookupConstraint } from '@lib/PostgreSQL/error/lookupConstraint.mjs'
import { expect } from 'chai'

// type test. Each @ts-expect-error line fail `yarn typecheck:tests` once line below start to compile.
// Fn holding them never called. build:tests is noCheck → only that gate prove it.
// toy codes + details-by-code map: stand-in for an application's own

type TToyCode = 'DUPLICATE_ITEM' | 'BIN_IN_USE' | 'EMAIL_TAKEN' | 'INTERNAL'

interface IToyDetails {
	DUPLICATE_ITEM: { kind: 'sku' | 'slot' | 'bin'; value: string }
	BIN_IN_USE: { orderIds: string[] }
}

// the one instantiation an application writes next to its table
const constraintEntry: IConstraintEntryBuilder<TToyCode, IToyDetails> = buildConstraintEntry

// compiled, never run. rows are checked
function rowsAreChecked(): void {
	// @ts-expect-error -- DUPLICATE_ITEM has documented details, so the row must say where they come from
	void constraintEntry('DUPLICATE_ITEM')
	// @ts-expect-error -- EMAIL_TAKEN has no documented details, so it takes no parts
	void constraintEntry('EMAIL_TAKEN', { supplied: ['value'] })
	// @ts-expect-error -- 'nope' is not a key of the details of DUPLICATE_ITEM
	void constraintEntry('DUPLICATE_ITEM', { supplied: ['nope'] })
	// @ts-expect-error -- 'month' is not a kind
	void constraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'month' }, supplied: ['value'] })
	// @ts-expect-error -- 'colour' is not a key of the details of DUPLICATE_ITEM
	void constraintEntry('DUPLICATE_ITEM', { fixed: { colour: 'red' }, supplied: ['value'] })
	const fixedAndSupplied = { fixed: { kind: 'sku' }, supplied: ['kind'] } as const
	// @ts-expect-error -- 'kind' is fixed, so it cannot also be supplied
	void constraintEntry('DUPLICATE_ITEM', fixedAndSupplied)
	// @ts-expect-error -- the code must be one of the closed list
	void constraintEntry('NOT_A_CODE')
	// @ts-expect-error -- the code must be one of the closed list, with parts too
	void constraintEntry('NOT_A_CODE', { supplied: ['value'] })
	// the accepted forms
	void constraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] })
	void constraintEntry('DUPLICATE_ITEM', { supplied: ['kind', 'value'] })
	void constraintEntry('BIN_IN_USE', { supplied: ['orderIds'] })
	void constraintEntry('BIN_IN_USE', {})
	void constraintEntry('EMAIL_TAKEN')
	void constraintEntry('INTERNAL')
}

// compiled, never run. row and table are generic over the codes
function tablesAreTyped(): void {
	const entry: IConstraintEntry<'A'> = buildConstraintEntry('A')
	// @ts-expect-error -- the code of the row is 'A', not 'B'
	const wrong: IConstraintEntry<'B'> = entry
	void wrong
	const narrow: IConstraintTable<'A' | 'B'> = { x: buildConstraintEntry('A'), y: buildConstraintEntry('B') }
	// a table over fewer codes fits where any string code is wanted
	const wide: IConstraintTable = narrow
	// @ts-expect-error -- a table over any string does not fit where only A and B are wanted
	const back: IConstraintTable<'A' | 'B'> = wide
	void back
	const found: IConstraintEntry<'A' | 'B'> | undefined = lookupConstraint(narrow, 'x')
	// @ts-expect-error -- the found row may be undefined
	const sure: IConstraintEntry<'A' | 'B'> = lookupConstraint(narrow, 'x')
	void [found, sure]
}

describe('the types of the constraint helpers', () => {
	it('are checked by the compiler (yarn typecheck:tests): a row cannot name a key its code does not have', () => {
		expect(typeof rowsAreChecked).to.equal('function')
		expect(typeof tablesAreTyped).to.equal('function')
	})

	it('give the typed view the same runtime function', () => {
		expect(constraintEntry).to.equal(buildConstraintEntry)
		expect(constraintEntry('DUPLICATE_ITEM', { fixed: { kind: 'sku' }, supplied: ['value'] })).to.deep.equal({
			code: 'DUPLICATE_ITEM',
			fixed: { kind: 'sku' },
			supplied: ['value']
		})
	})
})
