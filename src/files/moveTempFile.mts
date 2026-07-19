import { assertNoTraversal } from '@private/files/assertNoTraversal.mjs'
import fs from 'fs-extra'
import path from 'path'

/**
 *
 * @param sourceFilePath
 * @param destFilename
 * @param destinationDir
 */
export async function moveTempFile(sourceFilePath: string, destFilename: string, destinationDir: string) {
	// destFilename is a filename, not a path: a `..` in it escapes destinationDir via path.join below.
	// sourceFilePath and destinationDir are genuine caller-owned paths and are intentionally NOT
	// checked here — validating those is the consumer's responsibility.
	assertNoTraversal(destFilename, 'destFilename')

	// Ensure the destination directory exists
	await fs.ensureDir(destinationDir)

	// Define the destination path
	const ext = path.extname(sourceFilePath)
	const destinationPath = path.join(destinationDir, `${destFilename}${ext}`)

	// Move the file
	await fs.move(sourceFilePath, destinationPath)
}
