export const DateLib = class DateLib {
	constructor() {}

	static getDate(dateNum: Date) {
		const dateStr = dateNum.toString()
		const year = parseInt(dateStr.substring(0, 4))
		const month = parseInt(dateStr.substring(4, 6))
		const day = parseInt(dateStr.substring(6, 8))
		const hours = parseInt(dateStr.substring(8, 10))
		const min = parseInt(dateStr.substring(10, 12))
		const sec = parseInt(dateStr.substring(12, 14))

		const date = new Date(Date.UTC(year, month - 1, day, hours, min, sec))

		return {
			year,
			date
		}
	}

	static minElapsed(dt: Date): number {
		// read elapsed minutes
		const nowDt = new Date()
		const now = nowDt.getTime()

		const lastReq = dt.getTime()
		// const lastReq = new Date('' + dt).getTime()

		return DateLib.timeDiffMin(lastReq, now)
	}

	static timeDiffMin(lastReq: number, now: number): number {
		// Stryker disable next-line EqualityOperator: only the >= replacement is equivalent (lastReq === now makes both ternary arms 0). The <= replacement is NOT equivalent and stays covered: Stryker cannot disable one replacement only, so it was applied by hand and 5 DateLib specs (returns minutes for delta >= 60s, returns absolute diff, ...) plus the resetPwd and updatePassword throttle specs fail on it.
		const difference = lastReq > now ? lastReq - now : now - lastReq
		return Math.floor(difference / (1000 * 60))
	}
} /* c8 ignore next */
