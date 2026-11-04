/** Waits before retry number `retry` (1 for the first). Injected so that tests wait for nothing. */
export type IRetryDelay = (retry: number) => Promise<void>
