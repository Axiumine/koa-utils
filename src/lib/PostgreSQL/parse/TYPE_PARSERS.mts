import { DbParseError } from '@lib/PostgreSQL/error/DbParseError.mjs'
import { arrayOf } from '@lib/PostgreSQL/parse/arrayOf.mjs'
import type { IStringParser } from '@lib/PostgreSQL/parse/IStringParser.mjs'
import type { ITypeParserEntry } from '@lib/PostgreSQL/parse/ITypeParserEntry.mjs'
import { parseDate } from '@lib/PostgreSQL/parse/parseDate.mjs'
import { parseInt8 } from '@lib/PostgreSQL/parse/parseInt8.mjs'
import { parseTime } from '@lib/PostgreSQL/parse/parseTime.mjs'
import { parseTimestamptz } from '@lib/PostgreSQL/parse/parseTimestamptz.mjs'
import { parseUuid } from '@lib/PostgreSQL/parse/parseUuid.mjs'

/** A parser that refuses: the driver's own would hand over a `Date`, and these parsers never build one. */
function refuse(typeName: string): IStringParser {
	return () => {
		throw new DbParseError('UNSUPPORTED_TYPE', typeName)
	}
}

/**
 * The parsers of this library, by the OID of the type they read. The OIDs are those of the built-in types (`SELECT oid,
 * typname FROM pg_type`; the same numbers are in the text parsers of `pg-types` and in the PostgreSQL catalog source
 * `pg_type.dat`).
 *
 * Arrays are separate types: the driver's scalar parsers do not apply to an array of the same element (the OID of
 * `date[]` is not the OID of `date`), so each array type has its own entry. The driver's own `date[]` parser returns
 * `Date` values, its `time[]` parser returns the text with seconds, and a type it has no parser for comes back as the
 * raw text `{...}`.
 */
export const TYPE_PARSERS: readonly ITypeParserEntry[] = [
	{ oid: 20, typeName: 'bigint', parse: parseInt8 },
	{ oid: 1082, typeName: 'date', parse: parseDate },
	{ oid: 1083, typeName: 'time without time zone', parse: parseTime },
	{ oid: 1184, typeName: 'timestamp with time zone', parse: parseTimestamptz },
	{ oid: 1016, typeName: 'bigint[]', parse: arrayOf(parseInt8, 'bigint[]') },
	{ oid: 1182, typeName: 'date[]', parse: arrayOf(parseDate, 'date[]') },
	{ oid: 1183, typeName: 'time without time zone[]', parse: arrayOf(parseTime, 'time without time zone[]') },
	{ oid: 1185, typeName: 'timestamp with time zone[]', parse: arrayOf(parseTimestamptz, 'timestamp with time zone[]') },
	{ oid: 2951, typeName: 'uuid[]', parse: arrayOf(parseUuid, 'uuid[]') },
	// No parser exists for these: the driver's would return a Date.
	{ oid: 1114, typeName: 'timestamp without time zone', parse: refuse('timestamp without time zone') },
	{ oid: 1115, typeName: 'timestamp without time zone[]', parse: refuse('timestamp without time zone[]') }
]
