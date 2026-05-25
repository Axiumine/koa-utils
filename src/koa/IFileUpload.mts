export interface IFileUpload {
	createReadStream: () => NodeJS.ReadableStream
	filename: string
	mimetype: string
	encoding: string
}
