import { createKoaErrorHandler } from '../../dist/koa/createKoaErrorHandler.mjs'
import type { IKoaErrorHandlerContext } from '../../dist/koa/IKoaErrorHandlerContext.mjs'
import type { IKoaErrorHandlerOptions } from '../../dist/koa/IKoaErrorHandlerOptions.mjs'
import type { IContextKoaErrorHandler } from '@context/IContextKoaErrorHandler.mjs'
import { expect } from 'chai'
import type { Next, ParameterizedContext } from 'koa'

// ctx fake: plain data + app.emit recorder. Record raw args → arg count + identity assertable
function makeCtx(body: unknown = undefined) {
	const emitted: unknown[][] = []
	const ctx: IKoaErrorHandlerContext = {
		status: 200,
		body,
		app: {
			emit: (...args: unknown[]) => {
				emitted.push(args)
				return true
			}
		}
	}
	return { ctx, emitted }
}

const throws = (err: unknown) => (): Promise<unknown> => Promise.reject(err)

const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status })

// settle a promise → rejection reason, undefined when it resolved
async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise
	} catch (err: unknown) {
		return err
	}
	return undefined
}

const NO_BODY = [100, 101, 102, 204, 205, 304]
const WITH_BODY = [200, 203, 206, 303, 305, 500, 599]

describe('createKoaErrorHandler', () => {
	describe('next() does not throw', () => {
		it('resolves undefined, leaves ctx alone and calls no callback', async () => {
			const { ctx, emitted } = makeCtx('pre')
			const calls: string[] = []
			const handler = createKoaErrorHandler({
				statusOf: () => (calls.push('statusOf'), 418),
				bodyOf: () => (calls.push('bodyOf'), {}),
				report: () => void calls.push('report')
			})
			// next value ignored
			const result = await handler(ctx, () => Promise.resolve('ignored'))
			expect(result).to.equal(undefined)
			expect(ctx.status).to.equal(200)
			expect(ctx.body).to.equal('pre')
			expect(emitted).to.deep.equal([])
			expect(calls).to.deep.equal([])
		})
	})

	describe('defaults', () => {
		it('uses err.status and { message }', async () => {
			const { ctx, emitted } = makeCtx()
			const err = withStatus('teapot', 418)
			await createKoaErrorHandler()(ctx, throws(err))
			expect(ctx.status).to.equal(418)
			expect(ctx.body).to.deep.equal({ message: 'teapot' })
			expect(emitted).to.have.lengthOf(1)
		})

		it('no status → 500', async () => {
			const { ctx } = makeCtx()
			await createKoaErrorHandler()(ctx, throws(new Error('boom')))
			expect(ctx.status).to.equal(500)
			expect(ctx.body).to.deep.equal({ message: 'boom' })
		})

		// `||` not `??`: falsy status must still give 500
		for (const status of [0, Number.NaN]) {
			it(`status ${status} → 500`, async () => {
				const { ctx } = makeCtx()
				await createKoaErrorHandler()(ctx, throws(withStatus('falsy', status)))
				expect(ctx.status).to.equal(500)
				expect(ctx.body).to.deep.equal({ message: 'falsy' })
			})
		}

		// thrown non-Error → no field to read, never a TypeError (legacy tdwKoaErrorHandler still throws on null/undefined)
		const odd: [string, unknown][] = [
			['null', null],
			['undefined', undefined],
			['a string', 'boom'],
			['a number', 42]
		]
		for (const [label, thrown] of odd) {
			it(`thrown ${label} → 500, body { message: undefined }, emit gets the value`, async () => {
				const { ctx, emitted } = makeCtx()
				await createKoaErrorHandler()(ctx, throws(thrown))
				expect(ctx.status).to.equal(500)
				expect(ctx.body).to.deep.equal({ message: undefined })
				expect(Object.keys(ctx.body as object)).to.deep.equal(['message'])
				expect(emitted).to.have.lengthOf(1)
				expect(emitted[0]?.[1]).to.equal(thrown)
			})
		}

		it('options object with every field undefined = no options', async () => {
			const { ctx } = makeCtx()
			await createKoaErrorHandler({ statusOf: undefined, bodyOf: undefined, report: undefined, noBodyStatuses: undefined })(
				ctx,
				throws(withStatus('x', 204))
			)
			expect(ctx.status).to.equal(204)
			expect(ctx.body).to.equal(undefined)
		})
	})

	describe('callbacks', () => {
		it('statusOf, bodyOf, report get (err, ctx) by identity and nothing else', async () => {
			const { ctx } = makeCtx()
			const err = new Error('x')
			const calls: Record<string, unknown[]> = {}
			const spy =
				<T,>(name: string, result: T) =>
				(...args: unknown[]): T => {
					calls[name] = args
					return result
				}
			await createKoaErrorHandler({
				statusOf: spy('statusOf', 418),
				bodyOf: spy('bodyOf', 'b'),
				report: spy('report', undefined)
			})(ctx, throws(err))
			for (const name of ['statusOf', 'bodyOf', 'report']) {
				expect(calls[name], name).to.have.lengthOf(2)
				expect(calls[name]?.[0], name).to.equal(err)
				expect(calls[name]?.[1], name).to.equal(ctx)
			}
		})

		it('statusOf result is assigned as is, bodyOf sees the new status', async () => {
			const { ctx } = makeCtx()
			const seen: number[] = []
			await createKoaErrorHandler({
				statusOf: (_err, c) => (seen.push(c.status), 418),
				bodyOf: (_err, c) => (seen.push(c.status), { status: c.status }),
				report: (_err, c) => void seen.push(c.status)
			})(ctx, throws(new Error('x')))
			expect(seen).to.deep.equal([200, 418, 418])
			expect(ctx.body).to.deep.equal({ status: 418 })
		})

		it('bodyOf undefined keeps a pre-set body', async () => {
			const { ctx } = makeCtx('pre')
			await createKoaErrorHandler({ bodyOf: () => undefined })(ctx, throws(new Error('x')))
			expect(ctx.body).to.equal('pre')
			expect(ctx.status).to.equal(500)
		})

		// assigned unless strictly undefined: null, '', 0, false are real bodies
		for (const falsy of [null, '', 0, false]) {
			it(`bodyOf ${JSON.stringify(falsy)} is assigned`, async () => {
				const { ctx } = makeCtx('pre')
				await createKoaErrorHandler({ bodyOf: () => falsy })(ctx, throws(new Error('x')))
				expect(ctx.body).to.equal(falsy)
			})
		}

		it('a custom ctx field is readable in every callback', async () => {
			interface IMyCtx extends IKoaErrorHandlerContext {
				requestId: string
			}
			const seen: string[] = []
			const ctx: IMyCtx = { ...makeCtx().ctx, requestId: 'r1' }
			await createKoaErrorHandler<IMyCtx>({
				statusOf: (_err, c) => (seen.push(c.requestId), 418),
				bodyOf: (_err, c) => ({ requestId: c.requestId }),
				report: (_err, c) => void seen.push(c.requestId)
			})(ctx, throws(new Error('x')))
			expect(seen).to.deep.equal(['r1', 'r1'])
			expect(ctx.body).to.deep.equal({ requestId: 'r1' })
		})
	})

	describe('noBodyStatuses', () => {
		for (const status of NO_BODY) {
			it(`default: ${status} skips bodyOf and keeps the body`, async () => {
				const { ctx } = makeCtx('pre')
				let called = 0
				await createKoaErrorHandler({ bodyOf: () => (called++, 'new') })(ctx, throws(withStatus('x', status)))
				expect(ctx.status).to.equal(status)
				expect(called).to.equal(0)
				expect(ctx.body).to.equal('pre')
			})
		}

		for (const status of WITH_BODY) {
			it(`default: ${status} calls bodyOf`, async () => {
				const { ctx } = makeCtx('pre')
				await createKoaErrorHandler({ bodyOf: () => 'new' })(ctx, throws(withStatus('x', status)))
				expect(ctx.status).to.equal(status)
				expect(ctx.body).to.equal('new')
			})
		}

		it('a custom list replaces the default, it does not extend it', async () => {
			const handler = createKoaErrorHandler({ noBodyStatuses: [418] })
			const teapot = makeCtx()
			await handler(teapot.ctx, throws(withStatus('x', 418)))
			expect(teapot.ctx.body).to.equal(undefined)
			const noContent = makeCtx()
			await handler(noContent.ctx, throws(withStatus('x', 204)))
			expect(noContent.ctx.body).to.deep.equal({ message: 'x' })
		})

		it('an empty list gives every status a body', async () => {
			const handler = createKoaErrorHandler({ noBodyStatuses: [] })
			for (const status of NO_BODY) {
				const { ctx } = makeCtx()
				await handler(ctx, throws(withStatus('x', status)))
				expect(ctx.body, `status ${status}`).to.deep.equal({ message: 'x' })
			}
		})

		it('the array is copied at creation: later changes to it are ignored', async () => {
			const list = [418]
			const handler = createKoaErrorHandler({ noBodyStatuses: list })
			list.length = 0
			list.push(500)
			const teapot = makeCtx()
			await handler(teapot.ctx, throws(withStatus('x', 418)))
			expect(teapot.ctx.body).to.equal(undefined)
			const failed = makeCtx()
			await handler(failed.ctx, throws(withStatus('x', 500)))
			expect(failed.ctx.body).to.deep.equal({ message: 'x' })
			expect(list).to.deep.equal([500])
		})

		it('the check uses the status read back from ctx, not the value assigned', async () => {
			// Koa-like accessor: 999 is stored as 204 (no body), 204 is stored as 200 (body)
			const stored = { status: 200 }
			const emitted: unknown[][] = []
			const ctx: IKoaErrorHandlerContext = {
				get status() {
					return stored.status
				},
				set status(value: number) {
					stored.status = { 999: 204, 204: 200 }[value as 999 | 204] ?? value
				},
				body: 'pre',
				app: { emit: (...args: unknown[]) => emitted.push(args) }
			}
			let called = 0
			const bodyOf = () => (called++, 'new')
			await createKoaErrorHandler({ statusOf: () => 999, bodyOf })(ctx, throws(new Error('x')))
			expect(ctx.status).to.equal(204)
			expect(called).to.equal(0)
			expect(ctx.body).to.equal('pre')
			await createKoaErrorHandler({ statusOf: () => 204, bodyOf })(ctx, throws(new Error('x')))
			expect(ctx.status).to.equal(200)
			expect(called).to.equal(1)
			expect(ctx.body).to.equal('new')
		})
	})

	describe('order and failure', () => {
		it('status → bodyOf → body → report → emit, emit last', async () => {
			const log: string[] = []
			const state = { status: 200, body: undefined as unknown }
			const ctx: IKoaErrorHandlerContext = {
				get status() {
					return state.status
				},
				set status(value: number) {
					log.push('set status')
					state.status = value
				},
				get body() {
					return state.body
				},
				set body(value: unknown) {
					log.push('set body')
					state.body = value
				},
				app: { emit: (event: string) => (log.push(`emit ${event}`), true) }
			}
			await createKoaErrorHandler({
				statusOf: () => (log.push('statusOf'), 418),
				bodyOf: () => (log.push('bodyOf'), 'b'),
				report: () => void log.push('report')
			})(ctx, throws(new Error('x')))
			expect(log).to.deep.equal(['statusOf', 'set status', 'bodyOf', 'set body', 'report', 'emit error'])
		})

		it('emit sees the final ctx, in the same tick as the catch', async () => {
			const { ctx } = makeCtx()
			let atEmit: unknown
			ctx.app.emit = () => {
				atEmit = { status: ctx.status, body: ctx.body }
				return true
			}
			await createKoaErrorHandler({ bodyOf: () => 'b' })(ctx, throws(withStatus('x', 418)))
			expect(atEmit).to.deep.equal({ status: 418, body: 'b' })
		})

		it('emits exactly the event "error" with (err, ctx)', async () => {
			const { ctx, emitted } = makeCtx()
			const err = new Error('x')
			await createKoaErrorHandler()(ctx, throws(err))
			expect(emitted).to.have.lengthOf(1)
			expect(emitted[0]).to.have.lengthOf(3)
			expect(emitted[0]?.[0]).to.equal('error')
			expect(emitted[0]?.[1]).to.equal(err)
			expect(emitted[0]?.[2]).to.equal(ctx)
		})

		it('a throwing report rejects with its own error and skips emit; status and body are already set', async () => {
			const { ctx, emitted } = makeCtx()
			const failure = new Error('report failed')
			const reason = await rejection(
				createKoaErrorHandler({
					report: () => {
						throw failure
					}
				})(ctx, throws(withStatus('x', 418)))
			)
			expect(reason).to.equal(failure)
			expect(emitted).to.deep.equal([])
			expect(ctx.status).to.equal(418)
			expect(ctx.body).to.deep.equal({ message: 'x' })
		})

		it('a throwing bodyOf rejects before report and emit', async () => {
			const { ctx, emitted } = makeCtx()
			const failure = new Error('bodyOf failed')
			let reported = 0
			const reason = await rejection(
				createKoaErrorHandler({
					bodyOf: () => {
						throw failure
					},
					report: () => void reported++
				})(ctx, throws(new Error('x')))
			)
			expect(reason).to.equal(failure)
			expect(reported).to.equal(0)
			expect(emitted).to.deep.equal([])
		})

		it('a throwing statusOf rejects and leaves ctx alone', async () => {
			const { ctx, emitted } = makeCtx('pre')
			const failure = new Error('statusOf failed')
			const reason = await rejection(
				createKoaErrorHandler({
					statusOf: () => {
						throw failure
					}
				})(ctx, throws(new Error('x')))
			)
			expect(reason).to.equal(failure)
			expect(ctx.status).to.equal(200)
			expect(ctx.body).to.equal('pre')
			expect(emitted).to.deep.equal([])
		})

		it('catches a next() that throws synchronously', async () => {
			const { ctx, emitted } = makeCtx()
			await createKoaErrorHandler()(ctx, () => {
				throw withStatus('sync', 400)
			})
			expect(ctx.status).to.equal(400)
			expect(emitted).to.have.lengthOf(1)
		})

		it('a handler is reusable and keeps no state between requests', async () => {
			const handler = createKoaErrorHandler({ bodyOf: (err) => ({ n: (err as { n: number }).n }) })
			const first = makeCtx()
			const second = makeCtx()
			await handler(first.ctx, throws({ n: 1 }))
			await handler(second.ctx, throws({ n: 2 }))
			expect(first.ctx.body).to.deep.equal({ n: 1 })
			expect(second.ctx.body).to.deep.equal({ n: 2 })
		})
	})

	describe('shape', () => {
		it('returns a function of 2 parameters, like a Koa middleware', () => {
			expect(createKoaErrorHandler()).to.be.a('function').with.lengthOf(2)
		})

		// compile-time only: yarn typecheck:tests fails when a context stops fitting the bound
		it('accepts Koa ParameterizedContext and IContextKoaErrorHandler as the context type', () => {
			const fits = <T extends IKoaErrorHandlerContext>(options: IKoaErrorHandlerOptions<T>): IKoaErrorHandlerOptions<T> => options
			const forKoa = fits<ParameterizedContext>({ report: (_err, ctx) => void ctx.status })
			const forLegacy = fits<IContextKoaErrorHandler>({ bodyOf: (_err, ctx) => ctx.body })
			const koaHandler: (ctx: ParameterizedContext, next: Next) => Promise<void> = createKoaErrorHandler(forKoa)
			const legacyHandler: (ctx: IContextKoaErrorHandler, next: Next) => Promise<void> = createKoaErrorHandler(forLegacy)
			expect([koaHandler, legacyHandler]).to.have.lengthOf(2)
		})
	})
})
