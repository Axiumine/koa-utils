export class ArrayLib {
	constructor() {}

	arrDiff(arr1: string[], arr2: string[]) {
		const pair: [string[], string[]] = [arr1, arr2]
		const [smaller, larger] = pair.sort((a, b) => a.length - b.length)
		const smallSet = new Set(smaller)

		return larger.filter((x) => !smallSet.has(x))
	}
} /* c8 ignore next */
