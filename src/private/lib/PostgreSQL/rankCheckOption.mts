/** The `rankCheck` option as given, or a `TypeError` when it is neither a boolean nor missing. */
export function rankCheckOption(value: unknown): boolean | undefined {
	if (value !== undefined && typeof value !== 'boolean') throw new TypeError('rankCheck must be a boolean')
	return value
}
