import type { WebIO } from '@gltf-transform/core'

import type { IGlbReason } from '../../files/IGlbSanitiseResult.mjs'
import { validateKhronos } from './validateKhronos.mjs'

/**
 * Check the file the sanitiser wrote the way an outsider would: the Khronos validator must find no error, and glTF
 * Transform must read it back, meshopt decoding included. Every output must decode, so a file that fails here is never
 * returned, whatever the input looked like.
 */
export async function verifyGlbOutput(io: WebIO, glb: Uint8Array): Promise<IGlbReason[]> {
	const problems = await validateKhronos(glb)
	if (problems.length > 0) {
		return problems.map((problem) => ({ ...problem, code: 'OUTPUT_INVALID' as const }))
	}
	try {
		await io.readBinary(glb)
	} catch {
		return [{ code: 'OUTPUT_INVALID', message: 'the sanitised file does not decode' }]
	}
	return []
}
