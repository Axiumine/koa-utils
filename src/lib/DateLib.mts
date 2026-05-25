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
		// stampa date di confronto

		// legge minuti passati
		const nowDt = new Date()
		const now = nowDt.getTime()

		console.debug('ora ultimo invio: ', new Date('' + dt))
		console.debug('ora attuale     : ', nowDt)

		const lastReq = dt.getTime()
		// const lastReq = new Date('' + dt).getTime()

		const elapsed = DateLib.timeDiffMin(lastReq, now)
		console.debug('sono passati ', elapsed)
		return elapsed
	}

	static timeDiffMin(lastReq: number, now: number): number {
		const difference = lastReq > now ? lastReq - now : now - lastReq
		return Math.floor(difference / (1000 * 60))
	}
} /* c8 ignore next */
