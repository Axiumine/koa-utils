import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// local stand-in for the SocketLabs Injection API. 127.0.0.1, port picked by OS → no internet, no fixed port

interface IRecordedRequest {
	method: string | undefined
	path: string | undefined
	headers: IncomingHttpHeaders
	body: string
}

// index = 0-based count of requests seen so far, this one included
export type TReply = (res: ServerResponse, request: IRecordedRequest, index: number) => void

export interface IFakeServer {
	endpointUrl: string
	requests: IRecordedRequest[]
	close(): Promise<void>
}

export async function startFakeServer(reply: TReply): Promise<IFakeServer> {
	const requests: IRecordedRequest[] = []
	const server = createServer((req, res) => {
		const chunks: Buffer[] = []
		req.on('data', (chunk: Buffer) => chunks.push(chunk))
		req.on('end', () => {
			const record: IRecordedRequest = {
				method: req.method,
				path: req.url,
				headers: req.headers,
				body: Buffer.concat(chunks).toString('utf8')
			}
			requests.push(record)
			reply(res, record, requests.length - 1)
		})
	})
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	const { port } = server.address() as AddressInfo
	return {
		endpointUrl: `http://127.0.0.1:${port}/api/v1/email`,
		requests,
		close: async () => {
			// stalled replies keep sockets open → drop them or close() waits for ever
			server.closeAllConnections()
			await new Promise<void>((resolve) => server.close(() => resolve()))
		}
	}
}

// reply with fixed status + body
export const replyWith =
	(status: number, body: string, headers: Record<string, string> = {}): TReply =>
	(res) => {
		res.writeHead(status, { 'content-type': 'application/json', ...headers })
		res.end(body)
	}

// reply i uses replies[i], past the end the last one repeats
export const replySequence =
	(...replies: TReply[]): TReply =>
	(res, request, index) => {
		const reply = replies[Math.min(index, replies.length - 1)]
		reply?.(res, request, index)
	}

export const SUCCESS_BODY = JSON.stringify({ ErrorCode: 'Success', MessageResults: [], TransactionReceipt: null })

// never answers → client timeout fires
export const replyNever: TReply = () => undefined

// drop the socket → client sees a reset
export const replyReset: TReply = (res) => {
	res.socket?.destroy()
}

// port nobody listens on: bind, read port, close
export async function closedPortUrl(): Promise<string> {
	const server = await startFakeServer(replyNever)
	const { endpointUrl } = server
	await server.close()
	return endpointUrl
}
