import { readFileSync } from 'node:fs'

// Knip gate (yarn knip): unused files, exports, types and dependencies.
// The published surface is `package.json` `exports` (dist/X.mjs), but dist is build output, so each export key is
// mapped back to its source file (dist/X.mjs -> src/X.mts) and used as an entry. Without that, Knip reports every
// src file as unused.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const exportEntries = Object.values(pkg.exports).map((target) => target.import.replace(/^\.\/dist\//, 'src/').replace(/\.mjs$/, '.mts'))

/** @type {import('knip').KnipConfig} */
export default {
	entry: [
		...exportEntries,
		// Spec files are run by Mocha through `.mocharc.json` (dist-test/**), Knip reads the sources.
		'test/**/*.spec.{mts,ts}',
		// Node-run tooling and its colocated specs.
		'scripts/**/*.{mts,mjs}'
	],
	project: ['src/**/*.{mts,ts}', 'test/**/*.{mts,ts}', 'scripts/**/*.{mts,mjs}'],
	// Mocha entries are declared above; the plugin would otherwise resolve `dist-test/**` which is build output.
	mocha: false,
	ignore: [
		// Fully commented-out module, also excluded from c8 (.c8rc.json) and not in `exports`. Owner decides its fate.
		'src/files/checkForNSFW.mts'
	],
	ignoreBinaries: [
		// Host tools invoked from package.json scripts, not npm packages.
		'audit',
		'qodana',
		'cloc',
		'scc'
	],
	ignoreDependencies: [
		// Sequelize loads the dialect driver by name at runtime (src/dataSources/MariaDB); there is no static import.
		'mariadb',
		// Imported only by scripts/migrate-account-disabled-to-boolean.mjs through a dynamic path Knip cannot follow.
		'mongodb',
		// Loaded by ts-patch from the tsconfig `plugins` entry, never imported.
		'typescript-transform-paths',
		// The built .d.mts files import its types, it is not a declared devDependency (hint only, kept for visibility).
		'@types/keygrip',
		// Optional peer by design: the package keeps zero runtime dependencies and every peer is consumer-installed.
		'keygrip',
		// Unused today, kept pending owner decision.
		'mongodb-memory-server',
		'tsx'
	],
	// tsconfig.json carries comments and a trailing comma that Knip's JSON parser cannot resolve.
	ignoreUnresolved: [/^$/]
}
