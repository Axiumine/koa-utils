import type { IDriverTypes } from '@lib/PostgreSQL/parse/IDriverTypes.mjs'
import { TYPE_PARSERS } from '@lib/PostgreSQL/parse/TYPE_PARSERS.mjs'

/**
 * A type registry for one pool: the parsers of {@link TYPE_PARSERS} for their OIDs in text format, the driver's for
 * everything else. Results are read in text format; a binary request goes to the driver unchanged.
 *
 * node-postgres reads a `types` option of the pool (passed on to every client of it): any object with a
 * `getTypeParser(oid, format)` method. The object built here answers its own parsers first and the driver's for every
 * other type. It is a new object per call and it never calls `types.setTypeParser`, which writes the process-wide
 * registry of the driver; so the parsers of one pool are not seen by another pool, by a plain `new Pool()`, or by
 * `pg.types.getTypeParser`. The driver is asked on every call, so a parser registered on it later is seen for the types
 * this library does not parse.
 */
export function createTypeRegistry(driverTypes: IDriverTypes): IDriverTypes {
	const own = new Map<number, (text: string) => unknown>(TYPE_PARSERS.map((entry) => [entry.oid, entry.parse]))
	return {
		getTypeParser(oid, format) {
			if (format !== 'binary') {
				const parse = own.get(oid)
				if (parse !== undefined) return parse
			}
			return driverTypes.getTypeParser(oid, format)
		}
	}
}
