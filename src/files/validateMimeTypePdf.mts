import { validateMimeType } from './validateMimeType.mjs'

/**
 * Validate MIME type based on file content (magic number validation)
 * @param filePath
 */
export async function validateMimeTypePdf(filePath: string): Promise<string> {
	return await validateMimeType(filePath, ['application/pdf'])
}
