import { validateMimeType } from './validateMimeType.mjs'

/**
 * Validate MIME type based on file content (magic number validation)
 * @param filePath
 */
export async function validateJpgPngMimeType(filePath: string): Promise<string> {
	return await validateMimeType(filePath, ['image/jpeg', 'image/png'])
}
