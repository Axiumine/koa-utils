import { internalFailure } from '@private/lib/PostgreSQL/internalFailure.mjs'
import { expect } from 'chai'
import sinon from 'sinon'

import { appErrors } from '../../../helpers/appErrors.mjs'
import { recordingLogger } from '../../../helpers/recordingLogger.mjs'

describe('internalFailure', () => {
	it('counts, logs and builds, in that order, and answers the built error', () => {
		const order: string[] = []
		const log = recordingLogger()
		const sink = {
			errors: {
				internal: (reason: string) => {
					order.push('build')
					return appErrors.internal(reason)
				}
			},
			logger: {
				error: (message: string, fields?: Readonly<Record<string, unknown>>) => {
					order.push('log')
					log.logger.error(message, fields)
				}
			},
			counter: (name: string) => void order.push(`count:${name}`)
		}
		const error = internalFailure(sink, 'db_error_internal_total', 'a message', { reason: 'DB_ERROR', sqlstate: '42501' })
		expect(order).to.deep.equal(['count:db_error_internal_total', 'log', 'build'])
		expect(error).to.deep.include({ code: 'INTERNAL', details: { reason: 'DB_ERROR' } })
		expect(log.calls).to.deep.equal([
			{ level: 'error', message: 'a message', fields: { reason: 'DB_ERROR', sqlstate: '42501' } }
		])
	})

	it('logs the fields object it is given, whole, and gives the factory the reason only', () => {
		const internal = sinon.stub().callsFake(appErrors.internal)
		const error = sinon.spy()
		internalFailure({ errors: { internal }, logger: { error } }, 'db_error_internal_total', 'm', {
			reason: 'REREAD_UNREADABLE',
			field: 'rev'
		})
		expect(error.firstCall.args).to.deep.equal(['m', { reason: 'REREAD_UNREADABLE', field: 'rev' }])
		expect(internal.firstCall.args).to.deep.equal(['REREAD_UNREADABLE'])
	})

	it('works without a counter', () => {
		const log = recordingLogger()
		const error = internalFailure({ errors: appErrors, logger: log.logger }, 'db_error_internal_total', 'm', {
			reason: 'DB_ERROR'
		})
		expect(error.code).to.equal('INTERNAL')
		expect(log.calls).to.have.length(1)
	})

	it('counts the name it is given', () => {
		const names: string[] = []
		const log = recordingLogger()
		internalFailure(
			{ errors: appErrors, logger: log.logger, counter: (name) => void names.push(name) },
			'db_constraint_unmapped_total',
			'm',
			{
				reason: 'CONSTRAINT_UNMAPPED'
			}
		)
		expect(names).to.deep.equal(['db_constraint_unmapped_total'])
	})
})
