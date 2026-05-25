export class ArrayLib {
	constructor() {}

	arrDiff(arr1: string[], arr2: string[]) {
		const arrays = [arr1, arr2].sort((a, b) => a.length - b.length)
		const smallSet = new Set(arrays[0])

		return arrays[1].filter((x) => !smallSet.has(x))
	}
} /* c8 ignore next */
