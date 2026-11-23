import validator from 'gltf-validator'

import type { IGlbReason } from '../../files/IGlbSanitiseResult.mjs'
import { MAX_REASONS } from './glbReason.mjs'

type IValidate = typeof validator.validateBytes

/** Messages the validator collects before it stops. Errors come with the structure checks, so they come early. */
const MAX_ISSUES = 100

/**
 * Run the Khronos glTF Validator on a whole GLB. Every error (severity 0) becomes a `VALIDATOR_ERROR` reason, up to
 * `MAX_REASONS`. Warnings, infos and hints never reject. A crash of the validator is `VALIDATOR_FAILED`, not a throw.
 *
 * @param glb the whole GLB file, container and chunks
 * @param validate the validator entry point, a parameter so a spec can make it fail
 */
export async function validateKhronos(
	glb: Uint8Array,
	validate: IValidate = (bytes, options) => validator.validateBytes(bytes, options)
): Promise<IGlbReason[]> {
	let issues
	try {
		issues = (await validate(glb, { maxIssues: MAX_ISSUES })).issues
	} catch {
		return [{ code: 'VALIDATOR_FAILED', message: 'the glTF Validator crashed on the file' }]
	}
	const errors: IGlbReason[] = issues.messages
		.filter((issue) => issue.severity === 0)
		.slice(0, MAX_REASONS)
		.map((issue) => ({
			code: 'VALIDATOR_ERROR',
			message: `${issue.code}: ${issue.message}`,
			...(issue.pointer === undefined ? {} : { pointer: issue.pointer })
		}))
	return errors.length === 0 && issues.numErrors > 0
		? [{ code: 'VALIDATOR_ERROR', message: `the glTF Validator reported ${issues.numErrors} errors` }]
		: errors
}
