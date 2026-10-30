// Relative imports in scripts/ carry the real `.mts` extension: Node runs these files directly (type stripping), unlike src/ where `.mjs` is rewritten at build.
import { resolve } from 'node:path'

import { main } from './code-caps/cli.mts'

process.exitCode = main(process.argv.slice(2), resolve(import.meta.dirname, '..'))
