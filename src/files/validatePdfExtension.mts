import fs from 'fs-extra'

import { validateExtension } from './validateExtension.mjs'

export async function validatePdfExtension(filename: string, filePath: string) {
	if (!validateExtension(filename, ['.pdf'])) {
		await fs.remove(filePath) // Clean up the file
		throw new Error('Invalid file extension')
	}
}
