import { tdwKoaErrorHandler } from '../../dist/koa/tdwKoaErrorHandler.mjs'
import { expect } from 'chai'
import { EventEmitter } from 'events'
import { GraphQLError } from 'graphql'

import { restoreNodeEnv, saveNodeEnv } from '../helpers/nodeEnv.mjs'

// NOTE: Sentry.captureException non-stubbable in ESM. No init → no-op.
// Drive dev-mode branches, assert observable side effects only.

// Restore via `restoreNodeEnv`, never bare `process.env.NODE_ENV = saved`. Mocha set no NODE_ENV,
// so `saved` is normally undefined, and assigning undefined store literal string 'undefined'
// instead of clearing the var. That value then leak into every spec file running after this one.
// Load-bearing since the introspection env gate landed: `isIntrospectionBypassAllowed()` allowlist
// 'development' / 'test', so a leaked 'undefined' silently turn any later bypass assert into a
// false-negative — spec pass for the wrong reason.

interface CtxBody { message?: string; description?: string }

function makeCtx() {
	const app = new EventEmitter()
	const ctx = {
		status: 200,
		body: undefined as CtxBody | undefined,
		app
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ctx as any
}

describe('tdwKoaErrorHandler', () => {
	it('does nothing when next() succeeds', async () => {
		const ctx = makeCtx()
		let nextCalled = false
		await tdwKoaErrorHandler(ctx, async () => {
			nextCalled = true
		})
		expect(nextCalled).to.equal(true)
		expect(ctx.status).to.equal(200)
		expect(ctx.body).to.equal(undefined)
	})

	it('maps GraphQLError to ctx.status + body{message,description}', async () => {
		const ctx = makeCtx()
		const errors: unknown[] = []
		ctx.app.on('error', (e: unknown) => errors.push(e))
		const gqlErr = new GraphQLError('Conflict', {
			extensions: { http: { status: 409 }, description: 'already' }
		})
		await tdwKoaErrorHandler(ctx, async () => {
			throw gqlErr
		})
		expect(ctx.status).to.equal(409)
		expect(ctx.body).to.deep.equal({ message: 'Conflict', description: 'already' })
		expect(errors).to.have.lengthOf(1)
	})

	it('omits body for no-content statuses (204)', async () => {
		const ctx = makeCtx()
		ctx.app.on('error', () => undefined)
		const gqlErr = new GraphQLError('', {
			extensions: { http: { status: 204 } }
		})
		await tdwKoaErrorHandler(ctx, async () => {
			throw gqlErr
		})
		expect(ctx.status).to.equal(204)
		expect(ctx.body).to.equal(undefined)
	})

	it('omits body for 304 / 101 / 102 / 205', async () => {
		for (const status of [101, 102, 205, 304]) {
			const ctx = makeCtx()
			ctx.app.on('error', () => undefined)
			await tdwKoaErrorHandler(ctx, async () => {
				throw new GraphQLError('x', { extensions: { http: { status } } })
			})
			expect(ctx.status, `status ${status}`).to.equal(status)
			expect(ctx.body, `body for status ${status}`).to.equal(undefined)
		}
	})

	it('non-GraphQLError uses err.status or 500 with message body', async () => {
		const ctx = makeCtx()
		ctx.app.on('error', () => undefined)
		const err = Object.assign(new Error('oops'), { status: 503 })
		await tdwKoaErrorHandler(ctx, async () => {
			throw err
		})
		expect(ctx.status).to.equal(503)
		expect(ctx.body).to.deep.equal({ message: 'oops' })
	})

	it('non-GraphQLError without status -> 500', async () => {
		const ctx = makeCtx()
		ctx.app.on('error', () => undefined)
		await tdwKoaErrorHandler(ctx, async () => {
			throw new Error('boom')
		})
		expect(ctx.status).to.equal(500)
		expect(ctx.body).to.deep.equal({ message: 'boom' })
	})

	it('falls back to status 500 when GraphQLError has no http extension', async () => {
		const ctx = makeCtx()
		ctx.app.on('error', () => undefined)
		await tdwKoaErrorHandler(ctx, async () => {
			throw new GraphQLError('No ext')
		})
		expect(ctx.status).to.equal(500)
		expect(ctx.body).to.deep.equal({ message: 'No ext', description: '' })
	})

	it('development mode: non-GraphQL error still sets body and emits app error', async () => {
		const originalEnv = saveNodeEnv()
		process.env.NODE_ENV = 'development'
		try {
			const ctx = makeCtx()
			const emitted: unknown[] = []
			ctx.app.on('error', (e: unknown) => emitted.push(e))
			const err = new Error('dev error')
			await tdwKoaErrorHandler(ctx, async () => { throw err })
			// Sentry.captureException non-stubbable → assert observable effects
			expect(ctx.status).to.equal(500)
			expect(ctx.body).to.deep.equal({ message: 'dev error' })
			expect(emitted).to.have.lengthOf(1)
		} finally {
			restoreNodeEnv(originalEnv)
		}
	})

	it('development mode: GraphQL error does NOT invoke Sentry path — body and status still set', async () => {
		const originalEnv = saveNodeEnv()
		process.env.NODE_ENV = 'development'
		try {
			const ctx = makeCtx()
			ctx.app.on('error', () => undefined)
			await tdwKoaErrorHandler(ctx, async () => {
				throw new GraphQLError('gql in dev', { extensions: { http: { status: 418 }, description: 'teapot' } })
			})
			expect(ctx.status).to.equal(418)
			expect(ctx.body).to.deep.equal({ message: 'gql in dev', description: 'teapot' })
		} finally {
			restoreNodeEnv(originalEnv)
		}
	})
})
