/** The privileges `assertRole` accepts, by the kind of object they are asked on. */
export const ROLE_PRIVILEGES: Readonly<Record<'schema' | 'relation' | 'column', readonly string[]>> = {
	schema: ['USAGE', 'CREATE'],
	relation: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'USAGE'],
	column: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']
}
