import { GLB_POLICY_DEFAULTS, type IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import { GLB_SUPPORTED_EXTENSIONS } from './glbExtensions.mjs'

function assertKnownKeys(options: Partial<IGlbPolicy>) {
	for (const key of Object.keys(options)) {
		if (!Object.hasOwn(GLB_POLICY_DEFAULTS, key)) {
			throw new TypeError(`sanitiseGlb: unknown option ${key}`)
		}
	}
}

const NOT_LIMITS = new Set(['allowedExtensions', 'textureQuality'])

function assertLimits(policy: IGlbPolicy) {
	const fields: Record<string, unknown> = { ...policy }
	for (const [name, value] of Object.entries(fields)) {
		if (!NOT_LIMITS.has(name) && (!Number.isSafeInteger(value) || (value as number) <= 0)) {
			throw new TypeError(`sanitiseGlb: option ${name} must be a positive integer`)
		}
	}
}

function assertQuality(quality: number) {
	if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
		throw new TypeError('sanitiseGlb: option textureQuality must be an integer from 1 to 100')
	}
}

const isSupported = (name: unknown): boolean => typeof name === 'string' && GLB_SUPPORTED_EXTENSIONS.includes(name)

function assertExtensions(allowed: unknown) {
	if (!Array.isArray(allowed)) {
		throw new TypeError('sanitiseGlb: option allowedExtensions must be an array of names')
	}
	const unsupported = (allowed as unknown[]).filter((name) => !isSupported(name))
	if (unsupported.length > 0) {
		throw new RangeError(
			`sanitiseGlb: allowedExtensions holds names the sanitiser cannot rewrite: ${unsupported.map(String).join(', ')}`
		)
	}
}

/**
 * The defaults with the caller's options on top. Throws on misuse: an unknown option, a limit that is not a positive
 * integer, a quality out of range, or an extension the sanitiser has no code for. A field set to `undefined` keeps its default.
 */
export function resolveGlbPolicy(options: Partial<IGlbPolicy>): IGlbPolicy {
	assertKnownKeys(options)
	const given: Record<string, unknown> = { ...options }
	const defined = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)) as Partial<IGlbPolicy>
	const policy: IGlbPolicy = { ...GLB_POLICY_DEFAULTS, ...defined }
	assertLimits(policy)
	assertQuality(policy.textureQuality)
	assertExtensions(policy.allowedExtensions)
	return policy
}
