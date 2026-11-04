import { ROW_LOCK_MODES } from '@lib/PostgreSQL/lock/ROW_LOCK_MODES.mjs'
import { rowLockModeOf } from '@lib/PostgreSQL/lock/rowLockModeOf.mjs'
import { expect } from 'chai'

import { thrownBy } from '../../../helpers/recordingTx.mjs'

describe('ROW_LOCK_MODES and rowLockModeOf', () => {
	it('ROW_LOCK_MODES lists update and share, in that order', () => {
		expect([...ROW_LOCK_MODES]).to.deep.equal(['update', 'share'])
	})

	it('answers a mode of the list as it is', () => {
		expect(rowLockModeOf('update')).to.equal('update')
		expect(rowLockModeOf('share')).to.equal('share')
	})

	it('refuses anything else with a TypeError that names the list and quotes nothing', () => {
		for (const value of [
			undefined,
			null,
			'',
			'UPDATE',
			'update ',
			'exclusive',
			'toString',
			'planted-secret-value-1234',
			1,
			{},
			['update']
		]) {
			const error = thrownBy(() => rowLockModeOf(value))
			expect(error).to.be.instanceOf(TypeError)
			expect(error).to.have.property('message', 'mode must be one of update, share')
		}
	})
})
