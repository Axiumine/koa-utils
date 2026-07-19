import { assertNoTraversal } from '@private/files/assertNoTraversal.mjs'

import { UPLOAD_IMG_DIRECTORY_URL } from './fileConst.mjs'
import { moveTempFile } from './moveTempFile.mjs'

export async function moveImageFile(sourceFilePath: string, folder: string, secondFolder: string, destFilename: string) {
	// folder/secondFolder are path segments: a `..` in them escapes UPLOAD_IMG_DIRECTORY_URL
	assertNoTraversal(folder, 'folder')
	assertNoTraversal(secondFolder, 'secondFolder')

	const destinationDir = `${UPLOAD_IMG_DIRECTORY_URL}/${folder}/${secondFolder}`

	await moveTempFile(sourceFilePath, destFilename, destinationDir)
}
