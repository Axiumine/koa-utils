// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- public API: consumers import the class and call `NumLib.parseFloatFixed()`; replacing it with plain functions is a breaking change
export class NumLib {
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
