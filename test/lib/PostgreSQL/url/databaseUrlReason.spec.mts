import { databaseUrlReason } from '@lib/PostgreSQL/url/databaseUrlReason.mjs'
import { LOOPBACK_HOSTS } from '@lib/PostgreSQL/url/LOOPBACK_HOSTS.mjs'
import { expect } from 'chai'
import pg from 'pg'

const ROLE = 'app_role'
const FULL = 'sslmode=verify-full'
const CA = 'sslrootcert=/etc/ca/internal.crt'

// verdict as a word: 'ok' | reason. allowPlainLoopback default false → TLS rule strict
function verdict(url: string, allowPlainLoopback = false, expectedRole = ROLE): string {
	return databaseUrlReason(url, { expectedRole, allowPlainLoopback }) ?? 'ok'
}

// password in userinfo, built here so no spec literal carry a credential shape
function withPassword(user: string, password: string, rest: string, scheme = 'postgres'): string {
	return `${scheme}://${user}:${password}@${rest}`
}

describe('databaseUrlReason', () => {
	it('LOOPBACK_HOSTS is exactly the three lower-case loopback names', () => {
		expect([...LOOPBACK_HOSTS]).to.deep.equal(['127.0.0.1', '::1', 'localhost'])
	})

	describe('the parts of a database URL', () => {
		const table: [string, string][] = [
			[`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'ok'],
			[`postgresql://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'ok'],
			[withPassword(ROLE, 'p%40ss', `db.internal:5432/app_dev?${FULL}`), 'ok'],
			[`postgres://${ROLE}@[2001:db8::1]:5432/app_dev?${FULL}`, 'ok'],
			[`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}&${CA}`, 'ok'],
			// edges of port range
			[`postgres://${ROLE}@db.internal:1/app_dev?${FULL}`, 'ok'],
			[`postgres://${ROLE}@db.internal:65535/app_dev?${FULL}`, 'ok'],
			// user, host, port and database name are all required
			[`postgres://db.internal:5432/app_dev?${FULL}`, 'url_user'],
			[`postgres://:pw@db.internal:5432/app_dev?${FULL}`, 'url_user'],
			[`postgres://${ROLE}@:5432/app_dev?${FULL}`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal/app_dev?${FULL}`, 'url_port'],
			[`postgres://${ROLE}@db.internal:0/app_dev?${FULL}`, 'url_port'],
			[`postgres://${ROLE}@db.internal:70000/app_dev?${FULL}`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal:5432?${FULL}`, 'url_database'],
			[`postgres://${ROLE}@db.internal:5432/?${FULL}`, 'url_database'],
			[`postgres://${ROLE}@db.internal:5432/a/b?${FULL}`, 'url_database'],
			[`postgres://${ROLE}@db.internal:5432/a%2Fb?${FULL}`, 'url_database'],
			[`postgres://${ROLE}@db.internal:5432/-lead?${FULL}`, 'url_database'],
			// a host that is not a host
			[`postgres://${ROLE}@db_internal:5432/app_dev?${FULL}`, 'url_host'],
			[`postgres://${ROLE}@127.1:5432/app_dev?${FULL}`, 'url_host'],
			[`postgres://${ROLE}@db%41.internal:5432/app_dev?${FULL}`, 'url_host'],
			// scheme and syntax
			[`mysql://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'url_scheme'],
			[`http://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'url_scheme'],
			['db.internal:5432/app_dev', 'url_scheme'],
			[`PostgreS://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'url_scheme'],
			[`xpostgres://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'url_scheme'],
			[`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}#frag`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal:5432/app dev?${FULL}`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}\n`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}\t`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}\u007f`, 'url_syntax'],
			[`postgres://${ROLE}@db.internal\\@evil.example:5432/app_dev?${FULL}`, 'url_syntax'],
			[` postgres://${ROLE}@db.internal:5432/app_dev?${FULL}`, 'url_syntax'],
			// unescaped @ in the password: host = part after the last @, still a valid URL
			[withPassword(ROLE, 'p@ss', `db.internal:5432/app_dev?${FULL}`), 'ok'],
			['', 'url_scheme']
		]
		for (const [url, expected] of table) {
			it(`${JSON.stringify(url)} -> ${expected}`, () => {
				expect(verdict(url)).to.equal(expected)
			})
		}

		it('refuses a user that is not a plain identifier (no percent-escape in the login)', () => {
			expect(verdict(`postgres://app%5Frole@db.internal:5432/d?${FULL}`, true)).to.equal('url_user')
			expect(verdict(`postgres://app role@db.internal:5432/d?${FULL}`, true)).to.equal('url_syntax')
		})

		it('accepts identifiers with digits, underscore and hyphen after the first character', () => {
			expect(verdict(`postgres://r-1_x@db.internal:5432/d-2_y?${FULL}`, false, 'r-1_x')).to.equal('ok')
			expect(verdict(`postgres://_r@db.internal:5432/_d?${FULL}`, false, '_r')).to.equal('ok')
		})

		it('answers the first reason in the documented order', () => {
			// bad everything: syntax, then scheme, user, role, host, port, database, query, tls
			expect(verdict(`mysql://u@h_h/d?x=1`)).to.equal('url_scheme')
			expect(verdict('postgres://worker_role@h_h/d?x=1')).to.equal('url_role')
			expect(verdict(`postgres://${ROLE}@h_h/d?x=1`)).to.equal('url_host')
			expect(verdict(`postgres://${ROLE}@h.x/d?x=1`)).to.equal('url_port')
			expect(verdict(`postgres://${ROLE}@h.x:5432/?x=1`)).to.equal('url_database')
			expect(verdict(`postgres://${ROLE}@h.x:5432/d?x=1`)).to.equal('url_query')
			expect(verdict(`postgres://${ROLE}@h.x:5432/d`)).to.equal('url_tls')
		})
	})

	describe('the expected role is a parameter', () => {
		const url = (user: string): string => `postgres://${user}@db.internal:5432/app_dev?${FULL}`

		it('accepts the URL of the role the service expects', () => {
			expect(verdict(url('app_role'), false, 'app_role')).to.equal('ok')
			expect(verdict(url('reader_role'), false, 'reader_role')).to.equal('ok')
		})

		it('refuses a URL whose user differs: a service cannot start under another login', () => {
			expect(verdict(url('worker_role'), false, 'app_role')).to.equal('url_role')
			expect(verdict(url('app_role'), false, 'worker_role')).to.equal('url_role')
			expect(verdict(url('app_role2'), false, 'app_role')).to.equal('url_role')
			expect(verdict(url('APP_ROLE'), false, 'app_role')).to.equal('url_role')
		})

		it('refuses a user smuggled in through the query', () => {
			expect(verdict(`${url('app_role')}&user=worker_role`, true)).to.equal('url_query')
		})
	})

	describe('the TLS rule', () => {
		const loopback = (host: string, query = ''): string => `postgres://${ROLE}@${host}:55432/app_ci${query}`
		const remote = (query = ''): string => `postgres://${ROLE}@db.internal:5432/app_dev${query}`

		for (const host of ['127.0.0.1', '[::1]', 'localhost', 'LOCALHOST']) {
			describe(`loopback host ${host}`, () => {
				it('is accepted without TLS when the caller allows plain loopback', () => {
					expect(verdict(loopback(host), true)).to.equal('ok')
					expect(verdict(loopback(host, '?sslmode=disable'), true)).to.equal('ok')
				})

				it('is refused without verify-full when the caller does not allow it', () => {
					expect(verdict(loopback(host), false)).to.equal('url_tls')
					expect(verdict(loopback(host, '?sslmode=disable'), false)).to.equal('url_tls')
					expect(verdict(loopback(host, '?sslmode=require'), false)).to.equal('url_tls')
				})

				it('is accepted with verify-full whatever the caller allows', () => {
					expect(verdict(loopback(host, `?${FULL}`), true)).to.equal('ok')
					expect(verdict(loopback(host, `?${FULL}`), false)).to.equal('ok')
				})
			})
		}

		describe('a remote host', () => {
			it('is refused without verify-full even when the caller allows plain loopback', () => {
				for (const query of ['', '?sslmode=disable', '?sslmode=require', '?sslmode=verify-ca', '?sslmode=prefer', '?sslmode=no-verify']) {
					expect(verdict(remote(query), true), query).to.equal('url_tls')
					expect(verdict(remote(query), false), query).to.equal('url_tls')
				}
				for (const query of ['?sslmode=verify_full', '?sslmode=VERIFY-FULL', '?sslmode=']) {
					expect(verdict(remote(query), true), query).to.equal('url_tls')
				}
			})

			it('is accepted with verify-full whatever the caller allows', () => {
				expect(verdict(remote(`?${FULL}`), true)).to.equal('ok')
				expect(verdict(remote(`?${FULL}`), false)).to.equal('ok')
			})
		})

		it('does not treat a near-loopback or a look-alike host as loopback', () => {
			for (const host of ['127.0.0.2', 'localhost.internal', '127.0.0.1.nip.example', 'localhost2', '[::2]', '0.0.0.0']) {
				expect(verdict(loopback(host), true), host).to.equal('url_tls')
			}
		})

		it('reads an IPv6 literal the way the driver does: the parser writes it in its short form', () => {
			const url = loopback('[0:0:0:0:0:0:0:1]')
			expect(new URL(url).hostname).to.equal('[::1]')
			expect(new pg.Client(url).host).to.equal('::1')
			expect(verdict(url, true)).to.equal('ok')
			expect(verdict(url, false)).to.equal('url_tls')
		})

		it('does not let user information make a remote host look like loopback', () => {
			// host = after the last @. text before = user → refused as such
			expect(verdict(`postgres://${ROLE}@127.0.0.1:55432@evil.example:5432/d`, true)).to.not.equal('ok')
			expect(verdict(withPassword('127.0.0.1', '55432', 'evil.example:5432/d'), true)).to.not.equal('ok')
		})
	})

	describe('the query is an allow-list', () => {
		const base = `postgres://${ROLE}@db.internal:5432/app_dev`
		const refused = [
			`?${FULL}&host=evil.example`,
			`?${FULL}&port=1`,
			`?${FULL}&password=x`,
			`?${FULL}&database=other`,
			`?${FULL}&ssl=0`,
			`?${FULL}&ssl=false`,
			`?${FULL}&uselibpqcompat=true`,
			`?${FULL}&sslcert=/x`,
			`?${FULL}&sslkey=/x`,
			`?${FULL}&options=-c%20search_path%3Dx`,
			`?${FULL}&application_name=x`,
			`?${FULL}&SSLMODE=disable`,
			`?${FULL}&sslmode=verify-full`,
			`?sslmode=disable&${FULL}`,
			`?${FULL}&sslrootcert=relative.crt`,
			`?${FULL}&sslrootcert=/a/../etc/x`,
			`?${FULL}&sslrootcert=/x&sslrootcert=/y`,
			`?${FULL}&=1`
		]
		for (const query of refused) {
			it(`refuses ${query}`, () => {
				expect(verdict(`${base}${query}`, true)).to.equal('url_query')
			})
		}

		it('accepts sslmode and an absolute sslrootcert, in either order', () => {
			expect(verdict(`${base}?${FULL}&${CA}`)).to.equal('ok')
			expect(verdict(`${base}?${CA}&${FULL}`)).to.equal('ok')
		})

		it('checks a query before the TLS rule', () => {
			expect(verdict(`${base}?host=evil.example`)).to.equal('url_query')
		})
	})

	describe('agreement with node-postgres', () => {
		// checker read URL with the parser the driver use → accepted URL reach host, port, user, db it checked
		// new pg.Client(url) parse string, open nothing
		const accepted = [
			`postgres://${ROLE}@db.internal:5432/app_dev?${FULL}`,
			withPassword(ROLE, 'p%40ss', `db.internal:6432/app_dev?${FULL}`, 'postgresql'),
			`postgres://${ROLE}@[2001:db8::1]:5432/app_dev?${FULL}`,
			`postgres://${ROLE}@127.0.0.1:55432/app_ci`,
			`postgres://${ROLE}@LOCALHOST:55432/app_ci?sslmode=disable`
		]
		for (const url of accepted) {
			it(`the driver reads the user, host, port and database of ${JSON.stringify(url)} as checked`, () => {
				expect(verdict(url, true)).to.equal('ok')
				const parsed = new URL(url)
				const client = new pg.Client(url)
				expect(client.user).to.equal(ROLE)
				expect(client.host).to.equal(parsed.hostname.replace(/^\[(.+)\]$/, '$1'))
				expect(client.port).to.equal(Number(parsed.port))
				expect(client.database).to.equal(parsed.pathname.slice(1))
			})
		}

		it('shows why the query is closed: the driver lets a query parameter replace the authority', () => {
			const client = new pg.Client(`postgres://${ROLE}@db.internal:5432/d?host=evil.example&user=worker_role&port=1`)
			expect(client.host).to.equal('evil.example')
			expect(client.user).to.equal('worker_role')
			expect(client.port).to.equal(1)
		})
	})
})
