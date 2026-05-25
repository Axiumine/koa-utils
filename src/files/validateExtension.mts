import path from 'path'

/**
 * Utility function to validate file extension
 * @param filename
 * @param allowedExtensions
 */
export const validateExtension = (filename: string, allowedExtensions: string[]) => {
	const ext = path.extname(filename).toLowerCase()
	return allowedExtensions.includes(ext)
}
