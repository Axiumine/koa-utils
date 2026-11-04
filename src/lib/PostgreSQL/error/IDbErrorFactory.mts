/**
 * The one error-factory port of the kit: how a part of the kit builds the error it hands to its caller, so that the kit
 * imports no error class of the application. The application passes an object that builds its own family of errors
 * (an HTTP error with a code and details, say), and the kit stays free of it.
 *
 * `withTx` reads `internal` only; the parts of the kit that map a driver error read all three members. The type is
 * generic over the error class so the application's own type flows through.
 */
export interface IDbErrorFactory<TError extends Error = Error> {
	/** True for an error of the application's family, which a part of the kit must pass through unchanged. */
	is(error: unknown): error is TError
	/** Builds the error for a closed code, with optional details. */
	make(code: string, details?: unknown): TError
	/** Builds the error for a failure the caller can do nothing about; `reason` is a closed word for the log. */
	internal(reason: string): TError
}
