/**
 * The closed lists of `claimRowsSkipLocked`: a table name, then a predicate name, then the whole statement. The statements
 * are yours and are written in your code, never built from input; the kit only picks one by two names that must be own
 * keys here. Each statement takes the number of rows as `$1`.
 */
export type IClaimRegistry = Readonly<Record<string, Readonly<Record<string, string>>>>
