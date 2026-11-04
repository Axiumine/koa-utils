/** What the factory needs of the driver's pool class: the `error` event. */
export interface IPoolEvents {
	on(event: 'error', listener: (error: Error) => void): unknown
}
