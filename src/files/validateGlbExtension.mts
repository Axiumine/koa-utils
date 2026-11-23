import fs from 'fs-extra'

import { validateExtension } from './validateExtension.mjs'

export async function validateGlbExtension(filename: string, filePath: string) {
	if (!validateExtension(filename, ['.glb'])) {
		await fs.remove(filePath) // Clean up the file
		throw new Error('Invalid file extension')
	}
}
