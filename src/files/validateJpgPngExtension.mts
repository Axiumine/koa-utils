import fs from 'fs-extra'

import { validateExtension } from './validateExtension.mjs'

export async function validateJpgPngExtension(filename: string, filePath: string) {
	if (!validateExtension(filename, ['.jpg', '.jpeg', '.png'])) {
		await fs.remove(filePath) // Clean up the file
		throw new Error('Invalid file extension')
	}
}
