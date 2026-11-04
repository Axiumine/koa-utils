/** What {@link databaseUrlReason} needs besides the URL. */
export interface IDatabaseUrlOptions {
	/** The role the service must connect as; the user of the URL must equal it exactly. */
	readonly expectedRole: string
	/**
	 * True when a loopback host may be reached without TLS (a disposable local database, a CI service container). The
	 * caller decides, from whatever environment signal it has: this function reads no environment variable.
	 */
	readonly allowPlainLoopback: boolean
}
