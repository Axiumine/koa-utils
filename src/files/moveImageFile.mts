import { UPLOAD_IMG_DIRECTORY_URL } from './fileConst.mjs'
import { moveTempFile } from './moveTempFile.mjs'

export async function moveImageFile(
	sourceFilePath: string,
	folder: string,
	secondFolder: string,
	destFilename: string
) {
	const destinationDir = `${UPLOAD_IMG_DIRECTORY_URL}/${folder}/${secondFolder}`

	await moveTempFile(sourceFilePath, destFilename, destinationDir)
}
