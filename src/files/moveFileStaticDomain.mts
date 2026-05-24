import { moveTempFile } from './moveTempFile.mjs'

/**
 * read  .env STATIC_FOLDER path
 * @param sourceFilePath
 * @param folder
 * @param secondFolder
 * @param destFilename
 */
export async function moveFileStaticDomain(
	sourceFilePath: string,
	folder: string,
	secondFolder: string,
	destFilename: string
) {
	const destinationDir = `${process.env.STATIC_FOLDER}/${folder}/${secondFolder}`

	await moveTempFile(sourceFilePath, destFilename, destinationDir)
}
