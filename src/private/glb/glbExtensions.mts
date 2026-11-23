import { GLB_POLICY_DEFAULTS } from '../../files/GLB_POLICY_DEFAULTS.mjs'

/** Extensions that are refused whatever `allowedExtensions` says. */
export const GLB_FORBIDDEN_EXTENSIONS: readonly string[] = ['KHR_interactivity']

/**
 * Extensions the sanitiser can read and write again: the defaults plus two that are safe but not on by default. A caller
 * may put only a name from this list into `allowedExtensions`.
 */
export const GLB_SUPPORTED_EXTENSIONS: readonly string[] = [
	...GLB_POLICY_DEFAULTS.allowedExtensions,
	'KHR_lights_punctual',
	'KHR_materials_variants'
]
