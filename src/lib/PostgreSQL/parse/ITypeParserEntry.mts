/** One parser of this library and the type it is for. */
export interface ITypeParserEntry {
	/** The OID of the type in `pg_type`; the OIDs of the built-in types are fixed. */
	readonly oid: number
	/** The name `format_type` prints. */
	readonly typeName: string
	/** `parse` returns what the column becomes, or throws a `DbParseError`. */
	readonly parse: (text: string) => unknown
}
