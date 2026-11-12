import { throwErrorWrongUserInput } from '@throw/throwErrorWrongUserInput.mjs'

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- published signature: removing `T` would break a consumer that passes an explicit type argument, `throwIfNotValidEnumValue<typeof MyEnum>(...)`
export function throwIfNotValidEnumValue<T extends Record<string, string | number>>(
	enumObj: T,
	value: string | number | boolean
): void {
	const ret = Object.values(enumObj).includes(value as string | number)
	if (!ret) {
		throw throwErrorWrongUserInput('Wrong enum value')
	}
}
