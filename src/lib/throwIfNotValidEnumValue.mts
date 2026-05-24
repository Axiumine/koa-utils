import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

export function throwIfNotValidEnumValue<T extends Record<string, string | number>>(
	enumObj: T,
	value: string | number | boolean
): void {
	const ret = Object.values(enumObj).includes(value as string | number)
	if (!ret) {
		throw throwErrorWrongUserInput('Wrong enum value')
	}
}
