export class StringLib {
	// implements IStringLib
	constructor() {}

	cleanHtml(str: string): string {
		return str.replace(/(<([^>]+)>)/gi, '')
	}

	cleanHtmlUndefined(str: string | undefined): string | undefined {
		return typeof str === 'undefined' ? str : str.replace(/(<([^>]+)>)/gi, '')
	}

	randomString(length: number): string {
		let s = ''
		do {
			s += Math.random().toString(36).substring(2)
		} while (s.length < length)
		s = s.substring(0, length)

		return s
	}

	/**
	 * return OTP as string
	 * @returns {string}
	 */
	getRandomOTP(): string {
		return '' + this.getRandomArbitrary(100000, 999999)
	}

	getRandomArbitrary(min: number, max: number) {
		return Math.trunc(Math.random() * (max - min) + min)
	}

	isoToTimestamp(isoStr: Date): number {
		// const date = new Date(isoStr)
		// return date.getTime()
		return isoStr.getTime()
	}

	isoFormatDMY(data: string): string {
		const d = new Date(data)
		return d.getUTCDate() + '/' + (d.getUTCMonth() + +1) + '/' + d.getUTCFullYear()
	}

	isoFormatDateTime(data: string): string {
		const d = new Date(data)
		return (
			d.getUTCDate() +
			'/' +
			(d.getUTCMonth() + +1) +
			'/' +
			d.getUTCFullYear() +
			' ' +
			d.getHours() +
			':' +
			(d.getMinutes() < 10 ? '0' : '') +
			d.getMinutes() +
			':' +
			(d.getSeconds() < 10 ? '0' : '') +
			d.getSeconds()
		)
	}

	makeLink(link: string, linkText: string = ''): string {
		return `<a target='_blank' href='${link}'>${linkText === '' ? link : linkText}</a>`
	}
} /* c8 ignore next */
