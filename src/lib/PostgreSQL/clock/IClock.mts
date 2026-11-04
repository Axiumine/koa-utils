/** A clock as a plain port: the current instant as epoch milliseconds. Structural, so any object with `now` fits. */
export interface IClock {
	now(): number
}
