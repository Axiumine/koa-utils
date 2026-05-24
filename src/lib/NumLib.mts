export class NumLib {
	constructor() {
	}

	/************
	 * parseFloat vuole il '.' come separatore decimale !!
	 *
	 * @param val
	 * @returns {number}
	 */
	static parseFloatFixed(val: string): number {
		return parseFloat(val.replace(/,/g, '.'))
	}
}
