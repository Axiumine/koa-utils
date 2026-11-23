import { createGlbIo } from '@private/glb/glbIo.mjs'
import { emptyStats, rejected } from '@private/glb/glbStats.mjs'
import { inspectGlbJson } from '@private/glb/inspectGlbJson.mjs'
import { parseGlbJson } from '@private/glb/parseGlbJson.mjs'
import { resolveGlbPolicy } from '@private/glb/resolveGlbPolicy.mjs'
import { rewriteGlb } from '@private/glb/rewriteGlb.mjs'
import { validateKhronos } from '@private/glb/validateKhronos.mjs'
import { verifyGlbOutput } from '@private/glb/verifyGlbOutput.mjs'

import { checkGlbContainer } from './checkGlbContainer.mjs'
import type { IGlbPolicy } from './GLB_POLICY_DEFAULTS.mjs'
import type { IGlbSanitiseResult } from './IGlbSanitiseResult.mjs'

/**
 * Check a GLB for hostile content and write a clean copy. In this order, and the first stage that finds a problem ends it:
 *
 * 1. the container: `glTF` magic, version 2, declared length, chunk layout, size ({@link checkGlbContainer});
 * 2. the JSON chunk parses as one JSON object;
 * 3. the policy: no external or `data:` URI, only allowed extensions, counts, triangles, vertices, accessors (sparse
 *    ones too), buffer bytes, and the size of every texture read from its header before anything decodes it;
 * 4. the Khronos glTF Validator: any error rejects;
 * 5. the rewrite through glTF Transform: meshopt data is decoded (bad data rejects), `extras`, unknown extensions and
 *    unused data are dropped, PNG, JPEG and WebP textures are re-encoded with `sharp`, one embedded buffer is written;
 * 6. the new file goes through the validator and the decoder once more.
 *
 * A hostile file never throws: it gives `{ accepted: false, reasons, stats }`. Only misuse throws (`TypeError` for
 * input that is not a `Uint8Array` or for an invalid option, `RangeError` for an extension the sanitiser cannot rewrite).
 * This function does not scan for viruses: call `scanVirus` on the stored file as well.
 *
 * @param input the whole GLB file
 * @param options the limits and the extension list; see {@link IGlbPolicy}. Every field has a safe default.
 */
export async function sanitiseGlb(input: Uint8Array, options: Partial<IGlbPolicy> = {}): Promise<IGlbSanitiseResult> {
	const policy = resolveGlbPolicy(options)
	if (!(input instanceof Uint8Array)) {
		throw new TypeError('sanitiseGlb: input must be a Uint8Array or a Buffer')
	}
	// One private copy: glTF Transform reads from offset 0 of the underlying buffer, so a view or a pooled Buffer would
	// fail to read. It also freezes what every stage sees if the caller changes its array while this call awaits.
	const bytes = new Uint8Array(input)
	const stats = emptyStats(bytes.length)
	const container = checkGlbContainer(bytes, policy)
	if (!container.ok) {
		return rejected([container.reason], stats)
	}
	const parsed = parseGlbJson(container.json)
	if (parsed.json === null) {
		return rejected(parsed.reasons, stats)
	}
	const violations = inspectGlbJson(parsed.json, container.bin, policy, stats)
	if (violations.length > 0) {
		return rejected(violations, stats)
	}
	const invalid = await validateKhronos(bytes)
	if (invalid.length > 0) {
		return rejected(invalid, stats)
	}
	const io = await createGlbIo(policy.allowedExtensions)
	const rewritten = await rewriteGlb(io, bytes, policy, stats)
	if (rewritten.glb === null) {
		return rejected(rewritten.reasons, stats)
	}
	const problems = await verifyGlbOutput(io, rewritten.glb)
	if (problems.length > 0) {
		return rejected(problems, stats)
	}
	stats.outputBytes = rewritten.glb.length
	return { accepted: true, glb: rewritten.glb, reasons: [], stats }
}
