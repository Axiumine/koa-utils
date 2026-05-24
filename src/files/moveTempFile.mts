import fs from 'fs-extra'
import path from 'path'


/**
 *
 * @param sourceFilePath
 * @param destFilename
 * @param destinationDir
 */
export async function moveTempFile(
	sourceFilePath: string,
	destFilename: string,
	destinationDir: string
) {

	// Ensure the destination directory exists
	await fs.ensureDir(destinationDir)

	// Define the destination path
	const ext = path.extname(sourceFilePath)
	const destinationPath = path.join(destinationDir, `${destFilename}${ext}`)

	// Move the file
	await fs.move(sourceFilePath, destinationPath)
}
