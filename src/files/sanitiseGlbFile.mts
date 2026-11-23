import { readFile, rm, stat, writeFile } from 'node:fs/promises'

import { tooLargeReason } from '@private/glb/glbReason.mjs'
import { emptyStats, rejected } from '@private/glb/glbStats.mjs'
import { resolveGlbPolicy } from '@private/glb/resolveGlbPolicy.mjs'

import type { IGlbPolicy } from './GLB_POLICY_DEFAULTS.mjs'
import type { IGlbSanitiseResult } from './IGlbSanitiseResult.mjs'
import { sanitiseGlb } from './sanitiseGlb.mjs'

/**
 * `sanitiseGlb` on a stored upload, for the temp file `storeUploadAsTemp` wrote. A file bigger than `maxBytes` is
 * refused from its size, before one byte is read.
 *
 * - accepted: the sanitised bytes replace the file at `filePath`, so the path stays valid for the mover.
 * - rejected: the file is deleted, like the extension and MIME validators do, so a hostile upload never stays on disk.
 *
 * Throws only on misuse (an invalid option) or when the file cannot be read, as `fs` does. A hostile file gives a
 * rejected result. Run `scanVirus` on the file before this call: the sanitiser looks at structure, not at signatures.
 *
 * @param filePath the temp file
 * @param options the limits and the extension list; see {@link IGlbPolicy}
 */
export async function sanitiseGlbFile(filePath: string, options: Partial<IGlbPolicy> = {}): Promise<IGlbSanitiseResult> {
	const policy = resolveGlbPolicy(options)
	// eslint-disable-next-line security/detect-non-literal-fs-filename -- the caller names a temp file it stored itself, nothing here builds the path from request data
	const { size } = await stat(filePath)
	const result =
		size > policy.maxBytes
			? rejected([tooLargeReason(size, policy.maxBytes)], emptyStats(size))
			: // eslint-disable-next-line security/detect-non-literal-fs-filename -- same caller-owned path as the stat above
				await sanitiseGlb(await readFile(filePath), policy)
	if (result.accepted) {
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- same caller-owned path as the stat above
		await writeFile(filePath, result.glb)
	} else {
		await rm(filePath, { force: true })
	}
	return result
}
