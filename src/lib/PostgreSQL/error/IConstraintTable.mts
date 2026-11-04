import type { IConstraintEntry } from './IConstraintEntry.mjs'

/**
 * A constraint table: the name of a constraint, as the driver reports it in the `constraint` field of the error, to
 * its row. It is data, not logic: the application owns it, the kit only reads it. Generic over the closed list of codes
 * the application uses; a table of `IConstraintEntry<'A' | 'B'>` is accepted where `IConstraintTable` is wanted.
 */
export type IConstraintTable<TCode extends string = string> = Readonly<Record<string, IConstraintEntry<TCode>>>
