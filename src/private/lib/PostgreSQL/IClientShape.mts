import type { IConnectCallback } from './IConnectCallback.mjs'

/** The members of the driver's client that the checked subclass uses. */
export interface IClientShape {
	connect(): Promise<unknown>
	connect(callback: IConnectCallback): void
	query(text: string): Promise<{ rows: Record<string, unknown>[] }>
	end(): Promise<void>
}
