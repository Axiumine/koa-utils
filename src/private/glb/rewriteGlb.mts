import type { Document, WebIO } from '@gltf-transform/core'
import { EXTMeshoptCompression } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'

import type { IGlbPolicy } from '../../files/GLB_POLICY_DEFAULTS.mjs'
import type { IGlbReason, IGlbStats } from '../../files/IGlbSanitiseResult.mjs'
import { reencodeTextures } from './reencodeTextures.mjs'
import { stripExtras } from './stripExtras.mjs'

export type IRewriteResult = { glb: Uint8Array; reasons: [] } | { glb: null; reasons: IGlbReason[] }

const failed = (reasons: IGlbReason[]): IRewriteResult => ({ glb: null, reasons })

/** The meshopt decoder throws "Malformed buffer data: <code>" on a stream it cannot decode. */
const isMeshoptFailure = (error: unknown): boolean => /malformed buffer data/i.test(String(error))

async function readDocument(io: WebIO, input: Uint8Array): Promise<{ document: Document } | { reason: IGlbReason }> {
	try {
		return { document: await io.readBinary(input) }
	} catch (error) {
		return isMeshoptFailure(error)
			? { reason: { code: 'MESHOPT_DECODE_FAILED', message: 'the EXT_meshopt_compression data does not decode' } }
			: { reason: { code: 'READ_FAILED', message: 'the glTF reader could not read the file' } }
	}
}

/**
 * A file that came in with meshopt compression goes out with it: required, and encoded again from the decoded data.
 * Without it the geometry of a 10 MB model would grow several times over.
 */
function keepMeshopt(document: Document): void {
	document
		.getRoot()
		.listExtensionsUsed()
		.find((extension) => extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME)
		?.setRequired(true)
}

/**
 * Read the file with glTF Transform (which decodes the meshopt data, so a stream that does not decode is rejected
 * here), then write a new one: no `extras`, no extension nobody allowed, no unused data, textures re-encoded by
 * `sharp`, one embedded buffer. Never throws on a hostile file.
 */
export async function rewriteGlb(io: WebIO, input: Uint8Array, policy: IGlbPolicy, stats: IGlbStats): Promise<IRewriteResult> {
	const read = await readDocument(io, input)
	if ('reason' in read) {
		return failed([read.reason])
	}
	const { document } = read
	stripExtras(document)
	await document.transform(prune({ keepLeaves: true, keepAttributes: true, keepSolidTextures: true }))
	const reasons = await reencodeTextures(document, policy, stats)
	if (reasons.length > 0) {
		return failed(reasons)
	}
	keepMeshopt(document)
	return { glb: await io.writeBinary(document), reasons: [] }
}
