/** The part of the driver's `types` module that the registry needs. */
export interface IDriverTypes {
	getTypeParser(oid: number, format?: 'text' | 'binary'): (value: string) => unknown
}
