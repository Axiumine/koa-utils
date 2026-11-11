import type { Types } from 'mongoose'

/**
 * Kept for backwards compatibility only: this function writes nothing.
 *
 * It used to build a `LogStatsGraphql` document and discard it. The `.save()` call was commented out, so
 * nothing reached MongoDB. The arguments are still accepted, and ignored, so that existing call sites keep
 * compiling.
 *
 * @deprecated No-op. Nothing is logged: remove the call, or write the document yourself through the `LogStatsGraphql` model.
 */
export const logGraphql: (owner: Types.ObjectId, nome: string, status: number, msTot: number) => void = function () {
	// Deliberately empty, see the doc above.
}
