/**
 * Parity: tdwKoaErrorHandler (wrapper over createKoaErrorHandler) vs a frozen copy of the pre-8.0.0 algorithm.
 *
 * Oracle below = legacy body, copied verbatim from 7.2.0. Never edit it to follow src → that defeat the proof.
 * Same thrown values through both, then compare status, body, emit args, Sentry events, microtask ticks.
 * Sentry observed with real in-memory client (helpers/sentryProbeS2.mts), not stubbed.
 */
import { tdwKoaErrorHandler } from '../../dist/koa/tdwKoaErrorHandler.mjs'
import type { IContextKoaErrorHandler } from '@context/IContextKoaErrorHandler.mjs'
import type { IKoaError } from '../../dist/koa/IKoaError.mjs'
import * as Sentry from '@sentry/node'
import { expect } from 'chai'
import { GraphQLError } from 'graphql'

import { restoreNodeEnv, saveNodeEnv } from '../helpers/nodeEnv.mjs'
import { ISentryProbe, startSentryProbe } from '../helpers/sentryProbeS2.mjs'

// ---- oracle: legacy tdwKoaErrorHandler, 7.2.0 ----
function legacyResolveErrorStatus(errKoa: IKoaError, isIstanceOfGQL: boolean): number {
	if (isIstanceOfGQL) {
		return errKoa.extensions?.http?.status || 500
	}
	return errKoa.status || 500
}

function legacyBuildErrorBody(errKoa: IKoaError, isIstanceOfGQL: boolean, status: number): IContextKoaErrorHandler['body'] | undefined {
	const allowBody = ![100, 101, 102, 204, 205, 304].includes(status)

	if (!allowBody) {
		return undefined
	}

	const body: IContextKoaErrorHandler['body'] = {
		message: errKoa.message
	}
	if (isIstanceOfGQL) {
		body.description = errKoa.extensions?.description || ''
	}
	return body
}

function legacyMaybeCaptureSentryError(errKoa: IKoaError, isIstanceOfGQL: boolean): void {
	if (process.env['NODE_ENV'] === 'development') {
		if (!isIstanceOfGQL) {
			Sentry.captureException(errKoa)
		}
	}
}

async function legacyTdwKoaErrorHandler(ctx: IContextKoaErrorHandler, next: () => Promise<unknown>) {
	try {
		await next()
	} catch (err: unknown) {
		const errKoa = err as IKoaError
		const isIstanceOfGQL = err instanceof GraphQLError

		ctx.status = legacyResolveErrorStatus(errKoa, isIstanceOfGQL)

		const body = legacyBuildErrorBody(errKoa, isIstanceOfGQL, ctx.status)
		if (body) {
			ctx.body = body
		}

		legacyMaybeCaptureSentryError(errKoa, isIstanceOfGQL)

		ctx.app.emit('error', errKoa, ctx)
	}
}
// ---- end oracle ----

type THandler = (ctx: IContextKoaErrorHandler, next: () => Promise<unknown>) => Promise<void>

function makeCtx() {
	const emitted: unknown[][] = []
	const ctx = {
		status: 200,
		body: { message: 'pre' } as IContextKoaErrorHandler['body'] | undefined,
		app: {
			emit: (...args: unknown[]) => {
				emitted.push(args)
			}
		}
	} as unknown as IContextKoaErrorHandler
	return { ctx, emitted }
}

// what a caller can observe after one request
async function observe(handler: THandler, thrown: unknown, probe: ISentryProbe) {
	const { ctx, emitted } = makeCtx()
	let rejected: unknown
	const before = probe.events.length
	try {
		await handler(ctx, () => Promise.reject(thrown))
	} catch (err: unknown) {
		rejected = err
	}
	await probe.flush()
	return {
		rejectedWith: rejected instanceof Error ? rejected.constructor.name : rejected,
		status: ctx.status,
		body: ctx.body,
		emitCount: emitted.length,
		emitEvent: emitted[0]?.[0],
		emitErrIsThrown: emitted[0]?.[1] === thrown,
		emitCtxIsCtx: emitted[0]?.[2] === ctx,
		sentry: probe.texts().slice(before)
	}
}

// microtask ticks until the returned promise settles: wrapper must add none over the legacy async function
async function ticksToSettle(run: () => Promise<void>): Promise<number> {
	let settled = false
	void run().then(() => {
		settled = true
	})
	let ticks = 0
	while (!settled) {
		await Promise.resolve()
		ticks++
	}
	return ticks
}

const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status })

const CASES: [string, () => unknown][] = [
	['GraphQL error 409 with description', () => new GraphQLError('Conflict', { extensions: { http: { status: 409 }, description: 'already' } })],
	['GraphQL error 409 without description', () => new GraphQLError('Conflict', { extensions: { http: { status: 409 } } })],
	['GraphQL error with http.status 0', () => new GraphQLError('zero', { extensions: { http: { status: 0 }, description: 'd' } })],
	['GraphQL error without http extension', () => new GraphQLError('No ext')],
	['GraphQL error 204', () => new GraphQLError('', { extensions: { http: { status: 204 } } })],
	['GraphQL error 304', () => new GraphQLError('x', { extensions: { http: { status: 304 } } })],
	['non-GraphQL error status 503', () => withStatus('oops', 503)],
	['non-GraphQL error status 0', () => withStatus('zero', 0)],
	['non-GraphQL error status 204', () => withStatus('none', 204)],
	['non-GraphQL error without status', () => new Error('boom')],
	['plain object with status and message', () => ({ status: 418, message: 'teapot' })],
	['thrown string', () => 'boom'],
	['thrown number', () => 42],
	// legacy reads errKoa.status on these: TypeError before ctx is touched. Kept as is (separate owner decision)
	['thrown null', () => null],
	['thrown undefined', () => undefined]
]

const ENVS: [string, string | undefined][] = [
	['development', 'development'],
	['production', 'production'],
	['unset', undefined]
]

describe('tdwKoaErrorHandler — parity with the pre-8.0.0 algorithm', () => {
	let probe: ISentryProbe
	let savedEnv: string | undefined

	beforeEach(async () => {
		savedEnv = saveNodeEnv()
		probe = await startSentryProbe()
	})

	afterEach(async () => {
		await probe.stop()
		restoreNodeEnv(savedEnv)
	})

	for (const [envLabel, env] of ENVS) {
		for (const [label, make] of CASES) {
			it(`NODE_ENV ${envLabel}: ${label}`, async () => {
				restoreNodeEnv(env)
				// fresh value per handler: Sentry marks a captured error object, 2nd capture of same object is dropped
				const legacy = await observe(legacyTdwKoaErrorHandler, make(), probe)
				const wrapped = await observe(tdwKoaErrorHandler as THandler, make(), probe)

				expect(wrapped).to.deep.equal(legacy)
			})
		}
	}

	// guard vs vacuous parity: oracle must really hit Sentry in dev, else the sentry field compares [] with []
	it('development: both report a non-GraphQL error once and a GraphQL error never', async () => {
		restoreNodeEnv('development')
		for (const handler of [legacyTdwKoaErrorHandler, tdwKoaErrorHandler as THandler]) {
			const plain = await observe(handler, new Error('dev boom'), probe)
			const gql = await observe(handler, new GraphQLError('gql'), probe)
			expect(plain.sentry).to.deep.equal(['dev boom'])
			expect(gql.sentry).to.deep.equal([])
		}
	})

	it('settles in as many microtask ticks as the legacy async function, on success and on error', async () => {
		for (const next of [() => Promise.resolve(), () => Promise.reject(new Error('x'))]) {
			const legacy = await ticksToSettle(() => legacyTdwKoaErrorHandler(makeCtx().ctx, next))
			const wrapped = await ticksToSettle(() => tdwKoaErrorHandler(makeCtx().ctx, next))
			expect(wrapped).to.equal(legacy)
		}
	})

	it('keeps its name and arity', () => {
		expect(tdwKoaErrorHandler.name).to.equal('tdwKoaErrorHandler')
		expect(tdwKoaErrorHandler.length).to.equal(2)
	})
})
