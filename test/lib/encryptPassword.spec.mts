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
		// Asserting only the $2b$ prefix leaves the work factor unchecked: dropping
		// SALT_ROUNDS to bcrypt's floor of 4 keeps the format valid and round-tripping
		// correct, while making offline cracking of leaked hashes orders of magnitude
		// cheaper. The cost is encoded in the hash itself, so assert it there.
		expect(hashed.split('$')[2]).to.equal('14')
		expect(SALT_ROUNDS).to.equal(14)
	})

	it('produces a hash that round-trips through bcrypt.compare', async function () {
		this.timeout(20000)
		const ok = await compareHashAsync('s3cret-pass', hashed)
		expect(ok).to.equal(true)
	})
})
