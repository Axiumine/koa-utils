import { connectAndCheck } from './connectAndCheck.mjs'
import type { IClientConstructor } from './IClientConstructor.mjs'
import type { IConnectCallback } from './IConnectCallback.mjs'
import type { IConnectSettings } from './IConnectSettings.mjs'

/**
 * The subclass of the driver's client that every connection of the pool is made with (the `Client` option of the
 * pool). Its `connect`, in the promise form and in the callback form pg-pool uses, runs the driver's connect, the login
 * and the session check inside one deadline.
 */
export function checkedClient(Base: IClientConstructor, settings: IConnectSettings): IClientConstructor {
	return class CheckedClient extends Base {
		override connect(): Promise<void>
		override connect(callback: IConnectCallback): void
		override connect(callback?: IConnectCallback): Promise<void> | void {
			const done = connectAndCheck(this, () => super.connect(), settings)
			if (callback === undefined) return done
			done.then(
				() => {
					callback(null)
				},
				(error: unknown) => {
					callback(error as Error)
				}
			)
			return undefined
		}
	}
}
