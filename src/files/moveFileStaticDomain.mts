import { assertNoTraversal } from '@private/files/assertNoTraversal.mjs'

import { moveTempFile } from './moveTempFile.mjs'

/**
 * read  .env STATIC_FOLDER path
 * @param sourceFilePath
 * @param folder
 * @param secondFolder
 * @param destFilename
 */
export async function moveFileStaticDomain(sourceFilePath: string, folder: string, secondFolder: string, destFilename: string) {
	// folder/secondFolder are path segments: a `..` in them escapes STATIC_FOLDER
	assertNoTraversal(folder, 'folder')
	assertNoTraversal(secondFolder, 'secondFolder')

	const destinationDir = `${process.env.STATIC_FOLDER}/${folder}/${secondFolder}`

	await moveTempFile(sourceFilePath, destFilename, destinationDir)
}
