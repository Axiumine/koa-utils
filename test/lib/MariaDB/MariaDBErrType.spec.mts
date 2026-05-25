import { MariaDBErrType } from '@lib/MariaDB/MariaDBErrType.mjs'
import { expect } from 'chai'

describe('MariaDBErrType', () => {
	it('ER_DATA_TOO_LONG = "ER_DATA_TOO_LONG"', () => {
		expect(MariaDBErrType.ER_DATA_TOO_LONG).to.equal('ER_DATA_TOO_LONG')
	})
})
