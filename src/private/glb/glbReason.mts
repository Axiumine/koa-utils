import type { IGlbLimitName, IGlbReason } from '../../files/IGlbSanitiseResult.mjs'

/** One `LIMIT_EXCEEDED` reason when `value` is over `max`, otherwise no reason. A value equal to `max` passes. */
export function limitReasons(limit: IGlbLimitName, label: string, value: number, max: number): IGlbReason[] {
	return value > max
		? [{ code: 'LIMIT_EXCEEDED', limit, message: `${label}: ${value} is over the limit ${limit} = ${max}` }]
		: []
}

/** The most reasons one result carries. A hostile file can trigger thousands of validator errors. */
export const MAX_REASONS = 20

/** The `GLB_TOO_LARGE` reason, shared by the container check and by the file reader that refuses before it reads. */
export const tooLargeReason = (size: number, max: number): IGlbReason => ({
	code: 'GLB_TOO_LARGE',
	message: `the file has ${size} bytes, the limit is ${max}`
})
