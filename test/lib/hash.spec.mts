import { encryptPassword } from '@lib/encryptPassword.mjs'
import { compareHashAsync } from '@lib/hash.mjs'
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
