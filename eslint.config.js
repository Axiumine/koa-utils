import eslintConfig from '@axiumine/eslint-config-be';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const SRC = ['src/**/*.mts'];

// Scope a shared flat config (or array of them) to src only; spec files carry chai/sinon `any`s that
// these presets flag by the hundreds without signal.
const srcOnly = (configs) => [configs].flat().map((config) => ({ ...config, files: SRC }));

// eslint-plugin-security ships every rule as `warn`; `--max-warnings 0` and the suppressions ratchet
// both need real errors, so force each rule of the recommended preset to `error`.
const securityErrors = Object.fromEntries(Object.keys(security.configs.recommended.rules).map((rule) => [rule, 'error']));

export default [
	{
		ignores: ['dist/**', 'dist-test/**', 'node_modules/**', '.qodana/**', 'coverage/**']
	},
	...eslintConfig,
	// typescript-eslint strictTypeChecked, src only. Type information comes from the project set in the base config.
	...srcOnly(tseslint.configs.strictTypeChecked),
	...srcOnly(sonarjs.configs.recommended),
	...srcOnly(security.configs.recommended),
	{
		files: SRC,
		rules: {
			...securityErrors,
			// Public error contract: resolvers and helpers deliberately throw non-Error values (`throw { title, ... }`).
			'@typescript-eslint/only-throw-error': 'off',
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNullish: true, allowNumber: true }],
			'@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }]
		}
	},
	{
		// Size / complexity budget. This block is the editor mirror: `scripts/check-code-caps.mts` is the gate
		// (it also caps class size, which has no ESLint rule). Both count code lines, not blank or comment lines.
		files: SRC,
		rules: {
			'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
			'max-params': ['error', 4],
			'max-depth': ['error', 3],
			complexity: ['error', 10]
		}
	},
	{
		// Same budget for the spec suite, minus the two length rules. Spec files grow with the surface
		// they cover, and every spec wraps its whole body in one top-level `describe` callback — so both
		// `max-lines` and `max-lines-per-function` just measure file length there, which carries no signal.
		// The base config only wires a parser for src/, so tests need their own languageOptions block.
		files: ['test/**/*.mts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			}
		},
		// Registered so the specs' inline `eslint-disable @typescript-eslint/*` comments resolve.
		// No TS rules are enabled here — this block only carries the size budget, so those directives
		// read as unused; keep them, `yarn lint` runs with --fix and would otherwise strip them.
		plugins: {
			'@typescript-eslint': tsEslint
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'off'
		},
		rules: {
			'max-params': ['error', 4],
			'max-depth': ['error', 3],
			complexity: ['error', 10]
		}
	}
];
