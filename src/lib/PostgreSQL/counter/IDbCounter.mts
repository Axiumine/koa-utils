/**
 * The one function shape that a caller passes to count an event: called once per event with the name of the counter.
 * The kit keeps no registry and exposes no metrics endpoint; a caller that wants a number passes a function, one that
 * does not passes nothing.
 *
 * Generic over the name so each part of the kit narrows it to the names it emits, and so a counter typed over a wider
 * closed list of names is accepted as it is: `(name: 'a' | 'b') => void` is assignable to `IDbCounter<'a'>`.
 */
export type IDbCounter<TName extends string = string> = (name: TName) => void
