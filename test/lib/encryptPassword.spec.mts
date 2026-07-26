import { encryptPassword } from '@lib/encryptPassword.mjs'
import { SALT_ROUNDS } from '@private/lib/access/Constants.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
import { expect } from 'chai'

describe('encryptPassword', () => {
	let hashed: string

	before(async function () {
		this.timeout(20000)
		hashed = await encryptPassword('s3cret-pass')
	})

	it('produces a bcrypt-shaped hash', () => {
		expect(hashed).to.match(/^\$2[aby]\$/)
	})

	it('uses the configured cost factor of 14', () => {
		// Assert the $2b$ prefix only → work factor unchecked: SALT_ROUNDS dropped to
		// bcrypt floor 4 keep format valid + round-trip correct, while making offline
		// cracking of leaked hashes orders of magnitude cheaper. Cost is encoded in the
		// hash itself → assert it there.
		expect(hashed.split('$')[2]).to.equal('14')
		expect(SALT_ROUNDS).to.equal(14)
	})

	it('produces a hash that round-trips through bcrypt.compare', async function () {
		this.timeout(20000)
		const ok = await compareHashAsync('s3cret-pass', hashed)
		expect(ok).to.equal(true)
	})
})
