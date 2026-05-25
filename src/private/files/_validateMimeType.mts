/**
 * Utility function to validate MIME type via magic number
 * @param filePath
 * @param allowedMimeTypes
 */
export const _validateMimeType = async (filePath: string, allowedMimeTypes: string[]): Promise<string> => {
	// Dynamically import the file-type module
	const { fileTypeFromFile } = await import('file-type')

	const fileType = await fileTypeFromFile(filePath) // Get the file type from the file
	//console.debug('fileType', fileType)
	if (!fileType) return '' // Could not detect file type
	// Check if the detected MIME type is allowed and is so, return file extension
	if (allowedMimeTypes.includes(fileType.mime)) {
		return fileType.ext
	} else {
		return ''
	}
}
