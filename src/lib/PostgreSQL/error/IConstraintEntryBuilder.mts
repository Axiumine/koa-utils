import type { IConstraintEntry } from './IConstraintEntry.mjs'

/**
 * The typed view of `buildConstraintEntry` over an application's codes: `TCode` is the closed list of its codes and
 * `TDetailsByCode` maps each code that has documented details to the shape of them. The compiler then checks, per row:
 *
 * - a code without documented details takes no second argument;
 * - a code with documented details takes `fixed` (keys of its details, with their types) and `supplied` (the keys that
 *   `fixed` leaves out), so a row cannot name a key the code does not have, nor supply a key it already fixes;
 * - the code must be one of `TCode`.
 *
 * Instantiate it once, next to the table: `const constraintEntry: IConstraintEntryBuilder<ErrorCode, ErrorDetailsByCode> =
 * buildConstraintEntry`. The runtime function is the same; only the view differs.
 */
export interface IConstraintEntryBuilder<TCode extends string, TDetailsByCode extends object> {
	(code: Exclude<TCode, keyof TDetailsByCode>): IConstraintEntry<TCode>
	<TWith extends Extract<keyof TDetailsByCode, TCode>, const TFixed extends Partial<TDetailsByCode[TWith]> = object>(
		code: TWith,
		parts: {
			readonly fixed?: TFixed
			readonly supplied?: readonly Exclude<keyof TDetailsByCode[TWith], keyof TFixed>[]
		}
	): IConstraintEntry<TCode>
}
