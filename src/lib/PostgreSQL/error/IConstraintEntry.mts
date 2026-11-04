/**
 * One row of a constraint table: what the violation of one constraint becomes.
 *
 * - `code`: the code of the error the factory builds (`errors.make(code, details)`). The table's internal code
 *   (`internalCode` of `mapDbError`, default `INTERNAL`) is allowed and means "this constraint is known, and a violation
 *   of it can only be a defect": the name is logged, the response carries nothing of it.
 * - `fixed`: the details that the constraint itself determines. They are written in the table, so the mapper does not
 *   guess them from the driver text.
 * - `supplied`: the keys of the details that only the caller knows. `mapDbError` copies these keys from the `details`
 *   the caller passed and no others, and never reads them out of the message or the `detail` of the driver, which quote
 *   the failing row.
 */
export interface IConstraintEntry<TCode extends string = string> {
	readonly code: TCode
	readonly fixed?: Readonly<Record<string, unknown>>
	readonly supplied?: readonly string[]
}
