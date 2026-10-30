/**
 * Does this process require a TLS Redis connection?
 *
 * True only when `process.env.REDIS_TLS` is exactly the string `'true'`. Every other value — unset,
 * empty, `'1'`, `'TRUE'`, `'yes'` — returns `false` and leaves the plaintext `redis://` scheme in
 * place, byte-for-byte the behaviour every deployment had before this flag existed.
 *
 * ⚠️ The match is exact, and the trade-off it makes is deliberate rather than an oversight. A
 * misspelled value (`REDIS_TLS=TRUE`, `REDIS_TLS=1`) silently leaves the connection on plaintext
 * instead of failing, which is the price of keeping the flag strictly opt-in: the accepted spelling
 * is documented in `README.md`, and the gate is loud in the other direction — once the flag is on,
 * a non-`rediss://` `REDIS_URL` refuses to boot at all. Do not widen this to a truthiness test: `Boolean(process.env.REDIS_TLS)` reads the literal string
 * `'false'` as true, and `process.env.REDIS_TLS !== 'false'` enables TLS for an unset variable —
 * both change the scheme of connections whose operator never asked for it.
 *
 * Read at call time, never captured in a module-level constant: the ESM module cache would freeze a
 * constant at first import, and both callers here run at module load of `dataSources/Redis.mts`.
 */
export const isRedisTlsRequired = (): boolean => process.env['REDIS_TLS'] === 'true'
