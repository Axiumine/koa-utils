/**
 * The logger of the pool factory: the two levels it writes. Structural, so any logger with these two methods fits (a
 * `{ warn, error }` object, a pino or winston instance, a console wrapper).
 */
export interface IPoolLogger {
	warn(message: string, fields?: Readonly<Record<string, unknown>>): void
	error(message: string, fields?: Readonly<Record<string, unknown>>): void
}
