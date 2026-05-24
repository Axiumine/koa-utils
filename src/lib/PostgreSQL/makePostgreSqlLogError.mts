import { IPostgresError } from '@lib/PostgreSQL/IPostgresError.mjs'

export function makePostgreSqlLogError(pgError: IPostgresError): string {
	return `${pgError.code} | ${pgError.hint} | ${pgError.detail} | ${pgError.constraint}`
}
