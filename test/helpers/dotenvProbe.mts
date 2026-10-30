import fs from 'node:fs'
import path from 'node:path'
import sinon from 'sinon'

// dotenv ns import not stubbable, config() runs once per module load → unobservable after first import.
// distUrl = new URL('../../dist/x.mjs', import.meta.url).href from caller.
// Re-import w/ cache-bust query, spy fs.readFileSync (dotenv call it at call time) → read of cwd dotenv file = config() ran.

let seq = 0

export const dotenvConfigRanOnFreshImport = async (distUrl: string): Promise<boolean> => {
	const envFile = path.resolve(process.cwd(), '.env')
	const spy = sinon.spy(fs, 'readFileSync')
	try {
		await import(`${distUrl}?dotenvProbe=${++seq}`)
		return spy.getCalls().some((c) => path.resolve(String(c.args[0])) === envFile)
	} finally {
		spy.restore()
	}
}
