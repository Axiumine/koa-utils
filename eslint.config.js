import eslintConfig from '@axiumine/eslint-config-be';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
	{
		ignores: ['dist/**', 'dist-test/**', 'node_modules/**', '.qodana/**', 'coverage/**']
	},
	...eslintConfig,
	{
		// Size / complexity budget. Warnings only: they surface drift without blocking `yarn lint`.
		files: ['src/**/*.mts'],
		rules: {
			'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
			'max-params': ['warn', 4],
			'max-depth': ['warn', 3],
			complexity: ['warn', 10]
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
			'max-params': ['warn', 4],
			'max-depth': ['warn', 3],
			complexity: ['warn', 10]
		}
	}
];
