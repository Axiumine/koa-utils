import { isRoleName } from './isRoleName.mjs'

/** True for an array whose every entry is a plain identifier. The empty array is one. */
export function isNameList(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(isRoleName)
}
