/** A parser of an array: `null` stays `null` for an element that the server sent as `NULL`. */
export type IArrayParser = (text: string) => (string | null)[]
