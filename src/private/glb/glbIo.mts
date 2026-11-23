import { Logger, WebIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

/**
 * A glTF Transform reader and writer that knows exactly the allowed extensions and nothing else, plus the meshopt
 * decoder and encoder. `WebIO` is used, not `NodeIO`: it has no file access, and the sanitiser never lets a GLB point
 * at a file anyway. The logger is silent so a hostile file cannot flood the process log.
 */
export async function createGlbIo(allowedExtensions: readonly string[]): Promise<WebIO> {
	await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])
	return new WebIO()
		.setLogger(new Logger(Logger.Verbosity.SILENT))
		.registerExtensions(ALL_EXTENSIONS.filter((extension) => allowedExtensions.includes(extension.EXTENSION_NAME)))
		.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
}
