import { encryptPassword } from '@lib/encryptPassword.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
import { SALT_ROUNDS } from '@private/lib/access/Constants.mjs'
import { expect } from 'chai'

describe('hash + encryptPassword', () => {
	let hashed: string

	before(async function () {
		this.timeout(20000)
		hashed = await encryptPassword('s3cret-pass')
	})

	it('encryptPassword produces a bcrypt-shaped hash', () => {
		expect(hashed).to.match(/^\$2[aby]\$/)
	})

	it('encryptPassword uses the configured cost factor of 14', () => {
		// Asserting only the $2b$ prefix leaves the work factor unchecked: dropping
		// SALT_ROUNDS to bcrypt's floor of 4 keeps the format valid and round-tripping
		// correct, while making offline cracking of leaked hashes orders of magnitude
		// cheaper. The cost is encoded in the hash itself, so assert it there.
		expect(hashed.split('$')[2]).to.equal('14')
		expect(SALT_ROUNDS).to.equal(14)
	})

	it('compareHashAsync returns true for correct pwd', async function () {
		this.timeout(20000)
		const ok = await compareHashAsync('s3cret-pass', hashed)
		expect(ok).to.equal(true)
	})

	it('compareHashAsync returns false for wrong pwd', async function () {
		this.timeout(20000)
		const ok = await compareHashAsync('wrong', hashed)
		expect(ok).to.equal(false)
	})

	it('compareHashAsync re-throws when bcrypt throws (covers catch branch)', async () => {
		// Force an error by passing null as the hash — bcrypt will throw
		let thrown: unknown
		try {
			await compareHashAsync('pwd', null as unknown as string)
		} catch (e) {
			thrown = e
		}
		expect(thrown).to.exist
	})
})
