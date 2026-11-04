/** The callback form of the driver client's `connect`, which pg-pool uses. */
export type IConnectCallback = (error?: Error | null) => void
