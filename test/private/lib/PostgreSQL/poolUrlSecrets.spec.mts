import { DbConnectError } from '@lib/PostgreSQL/error/DbConnectError.mjs'
import { poolUrlSecrets } from '@private/lib/PostgreSQL/poolUrlSecrets.mjs'
import { expect } from 'chai'

const TAIL = '@127.0.0.1:5432/app_test'

function reasonOf(url: string): unknown {
	try {
		poolUrlSecrets(url)
	} catch (error) {
		return error instanceof DbConnectError ? error.reason : error
	}
	return undefined
}

describe('poolUrlSecrets', () => {
	it('answers only the URL when there is no password: an empty secret would be scrubbed between every character', () => {
		const url = `postgres://app_role${TAIL}`
		expect(poolUrlSecrets(url)).to.deep.equal([url])
	})

	it('answers the URL and a plain password once: the decoded form equals the raw one', () => {
		const url = `postgres://app_role:secret1${TAIL}`
		expect(poolUrlSecrets(url)).to.deep.equal([url, 'secret1'])
	})

	it('answers the URL, the password as written and the percent-decoded password', () => {
		const url = `postgres://app_role:p%40ss${TAIL}`
		expect(poolUrlSecrets(url)).to.deep.equal([url, 'p%40ss', 'p@ss'])
	})

	it('keeps the raw password when it is not valid percent-encoding', () => {
		const url = `postgres://app_role:100%${TAIL}`
		expect(poolUrlSecrets(url)).to.deep.equal([url, '100%'])
	})

	it('answers longest first, so the URL is scrubbed before the password it holds', () => {
		// scrub replace in list order. shorter first → piece of longer left behind
		for (const password of ['a', 'p%40ss', 'x%E2%82%ACy', 'pl4nted-Pa55%21word']) {
			const secrets = poolUrlSecrets(`postgres://app_role:${password}${TAIL}`)
			for (let i = 1; i < secrets.length; i += 1) {
				expect(secrets[i]?.length, password).to.be.at.most(secrets[i - 1]?.length ?? 0)
			}
		}
	})

	const refused = [
		'',
		'not a url',
		'http://app_role@127.0.0.1:5432/app_test',
		'postgres://app_role@:5432/app_test',
		`postgres://app_role${TAIL}#fragment`,
		`postgres://app_role${TAIL}?host=elsewhere`,
		`postgres://app_role${TAIL}?sslmode=verify-full&sslmode=disable`
	]
	for (const url of refused) {
		it(`refuses ${JSON.stringify(url)} with URL_INVALID`, () => {
			expect(reasonOf(url)).to.equal('URL_INVALID')
		})
	}

	it('accepts the two query parameters, each once, and the postgresql scheme', () => {
		const url = `postgresql://app_role${TAIL}?sslmode=verify-full&sslrootcert=/etc/ca/internal.crt`
		expect(poolUrlSecrets(url)).to.deep.equal([url])
	})
})
