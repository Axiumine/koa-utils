import { _validateMimeType } from '@private/files/_validateMimeType.mjs'
import fs from 'fs-extra'

/**
 * Validate MIME type based on file content (magic number validation)
 * @param filePath
 * @param allowedMimeTypes
 */
export async function validateMimeType(filePath: string, allowedMimeTypes: string[]): Promise<string> {
	const mimeType = await _validateMimeType(filePath, allowedMimeTypes)
	if (mimeType === '') {
		await fs.remove(filePath) // Clean up the file
		throw new Error('Invalid file MIME type')
	} else {
		return mimeType
	}
}
