/** A civil date of the proleptic Gregorian calendar; `year` is astronomical (1 BC is 0), `month` is 1 to 12. */
export interface ICivilDate {
	readonly year: number
	readonly month: number
	readonly day: number
}
