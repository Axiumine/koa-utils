/** What `withTx` needs of a connection: the node-postgres `PoolClient` has all of it. */
export interface ITxClient {
	query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[]; rowCount: number | null; command: string }>
	on(event: 'error', listener: (error: Error) => void): unknown
	removeListener(event: 'error', listener: (error: Error) => void): unknown
	/** `true` destroys the connection instead of returning it to the pool. */
	release(destroy?: boolean): void
}
