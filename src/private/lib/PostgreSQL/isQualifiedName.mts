/** Two plain identifiers joined by one dot. */
const QUALIFIED = /^[A-Za-z_][\w$]{0,62}\.[A-Za-z_][\w$]{0,62}$/

/** True for a string of the form `schema.name`, each part a plain identifier. Three parts, quotes and spaces are refused. */
export function isQualifiedName(value: unknown): value is string {
	return typeof value === 'string' && QUALIFIED.test(value)
}
