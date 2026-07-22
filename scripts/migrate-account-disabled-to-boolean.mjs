#!/usr/bin/env node
/**
 * Migrate `account.disabled` (and `account.deleted`) from string to boolean.
 *
 * WHY
 * `UserBaseSchema` / `UserAdminKoaUtilsSchema` declared `account.disabled` as `{ type: String }`
 * while both TypeScript interfaces typed it `boolean`. Consequences, all verified against a real
 * mongod:
 *
 *   - Writing `false` through Mongoose stored the STRING 'false'.
 *   - A hydrated read (`.exec()`, no `.lean()`) cast a stored boolean `false` to 'false' too.
 *   - Every consumer tests the flag with a bare `if (account.disabled)`. 'false' is truthy, so a
 *     user explicitly marked NOT disabled was refused login with 403 and mailed an
 *     "account disabled" notice.
 *
 * The schema now says `Boolean`, which repairs hydrated reads. It does NOT repair the stored data,
 * and `.lean()` readers (`userData4VerifyEmail`, `emailChangeHashVerify`) bypass casting entirely —
 * they still see the raw string. This script rewrites the values in place. Run it once, on every
 * database, as part of the upgrade.
 *
 * MAPPING
 *   'true'  (any case) -> true
 *   'false' (any case) -> false
 *   ''                 -> field removed (never meant anything)
 *   any other string   -> LEFT ALONE and reported. A value nobody planned for is not something a
 *                         migration should guess at; decide per row, then re-run.
 *   already boolean    -> untouched
 *
 * USAGE
 *   MONGO_URI='mongodb://user:pass@host:27017/dbname' node scripts/migrate-account-disabled-to-boolean.mjs
 *   ... --apply          actually write (default is a dry run that changes nothing)
 *   ... --db=<name>      database name, when the URI carries none
 *   ... --collections=user,userAdmin
 *
 * Requires `mongodb`, which ships as a dependency of the `mongoose` peer — no extra install.
 * Take a backup first. This edits user access flags.
 */
import { MongoClient } from 'mongodb'

const FIELDS = ['account.disabled', 'account.deleted']
const DEFAULT_COLLECTIONS = ['user', 'userAdmin']

function parseArgs(argv) {
	const apply = argv.includes('--apply')
	const get = (name) => {
		const hit = argv.find((a) => a.startsWith(`--${name}=`))
		return hit ? hit.slice(name.length + 3) : undefined
	}
	const collections = get('collections')

	return {
		apply,
		dbName: get('db'),
		collections: collections ? collections.split(',').map((c) => c.trim()).filter(Boolean) : DEFAULT_COLLECTIONS
	}
}

/** What a stored value should become. `undefined` means "leave it alone". */
function decide(value) {
	if (typeof value !== 'string') return undefined

	const norm = value.trim().toLowerCase()
	if (norm === 'true') return { set: true }
	if (norm === 'false') return { set: false }
	if (norm === '') return { unset: true }

	return undefined
}

async function migrateField(coll, field, apply) {
	const cursor = coll.find({ [field]: { $type: 'string' } }, { projection: { [field]: 1 } })
	const stats = { toTrue: 0, toFalse: 0, toUnset: 0, skipped: [] }

	for await (const doc of cursor) {
		const [root, leaf] = field.split('.')
		const value = doc[root]?.[leaf]
		const verdict = decide(value)

		if (verdict === undefined) {
			stats.skipped.push({ _id: doc._id, value })
			continue
		}

		if (verdict.unset) {
			stats.toUnset++
			if (apply) await coll.updateOne({ _id: doc._id }, { $unset: { [field]: '' } })
			continue
		}

		if (verdict.set) stats.toTrue++
		else stats.toFalse++
		if (apply) await coll.updateOne({ _id: doc._id }, { $set: { [field]: verdict.set } })
	}

	return stats
}

async function main() {
	const { apply, dbName, collections } = parseArgs(process.argv.slice(2))
	const uri = process.env.MONGO_URI

	if (!uri) {
		console.error('MONGO_URI is not set. Refusing to guess a connection string.')
		process.exit(1)
	}

	console.log(apply ? '=== APPLY: documents will be modified ===' : '=== DRY RUN: nothing will be written ===')
	console.log(`collections: ${collections.join(', ')}`)

	const client = new MongoClient(uri)
	let exitCode = 0

	try {
		await client.connect()
		const db = client.db(dbName)
		console.log(`database:    ${db.databaseName}\n`)

		for (const name of collections) {
			const exists = await db.listCollections({ name }).hasNext()
			if (!exists) {
				console.log(`- ${name}: collection absent, skipped`)
				continue
			}

			const coll = db.collection(name)
			for (const field of FIELDS) {
				const { toTrue, toFalse, toUnset, skipped } = await migrateField(coll, field, apply)
				const touched = toTrue + toFalse + toUnset

				if (touched === 0 && skipped.length === 0) {
					console.log(`- ${name}.${field}: already clean`)
					continue
				}

				console.log(`- ${name}.${field}: ${toTrue} -> true, ${toFalse} -> false, ${toUnset} removed (empty)`)

				if (skipped.length > 0) {
					exitCode = 2
					console.log(`  ${skipped.length} value(s) NOT recognised — left untouched, fix them by hand:`)
					for (const s of skipped) console.log(`    _id=${s._id} value=${JSON.stringify(s.value)}`)
				}
			}
		}

		console.log(apply ? '\nDone.' : '\nDry run complete. Re-run with --apply to write.')
		if (exitCode === 2) console.log('Exit code 2: unrecognised values remain. Resolve them, then re-run.')
	} finally {
		await client.close()
	}

	process.exit(exitCode)
}

await main()
