export class NumLib {
	constructor() {}

	/************
	 * parseFloat wants '.' as the decimal separator !!
	 *
	 * @param val
	 * @returns {number}
	 */
	static parseFloatFixed(val: string): number {
		return parseFloat(val.replace(/,/g, '.'))
	}
} /* c8 ignore next */
