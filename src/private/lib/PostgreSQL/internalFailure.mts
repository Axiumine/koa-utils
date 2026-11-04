import type { IDbInternalReason } from '@lib/PostgreSQL/error/IDbInternalReason.mjs'

import type { IInternalSink } from './IInternalSink.mjs'

/**
 * Counts, logs and builds the internal error of a closed reason, in that order. `fields` carries the reason and whatever
 * safe fields the caller adds; it is the whole log payload, and only `fields.reason` goes to the factory.
 */
export function internalFailure<TError extends Error, TName extends string>(
	sink: IInternalSink<TError, TName>,
	counterName: TName,
	message: string,
	fields: Readonly<Record<string, unknown>> & { readonly reason: IDbInternalReason }
): TError {
	sink.counter?.(counterName)
	sink.logger.error(message, fields)
	return sink.errors.internal(fields.reason)
}
