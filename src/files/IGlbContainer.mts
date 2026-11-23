import type { IGlbReason } from './IGlbSanitiseResult.mjs'

/** Result of `checkGlbContainer`. The byte arrays are views into the input, not copies. */
export type IGlbContainerResult =
	| {
			ok: true
			/** The JSON chunk. */
			json: Uint8Array
			/** The BIN chunk, `null` when the file has none. */
			bin: Uint8Array | null
	  }
	| { ok: false; reason: IGlbReason }
