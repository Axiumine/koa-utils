import path from 'path'

export const UPLOAD_TEMP_DIRECTORY_URL = '/tmp'
export const UPLOAD_IMG_DIRECTORY_URL = path.join(process.cwd(), 'upload/uimg')

export interface IStoreFile {
	originalFilename: string
	fileName: string
	filePath: string
}
