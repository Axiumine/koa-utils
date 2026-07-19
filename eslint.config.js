import eslintConfig from '@axiumine/eslint-config-be';

export default [
	{
		ignores: ['dist/**', 'dist-test/**', 'node_modules/**', '.qodana/**', 'coverage/**']
	},
	...eslintConfig,
	{
		// Size / complexity budget. Warnings only: they surface drift without blocking `yarn lint`.
		// Scoped to src/ — spec files wrap everything in one long `describe`, which these rules cannot model.
		files: ['src/**/*.mts'],
		rules: {
			'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
			'max-params': ['warn', 4],
			'max-depth': ['warn', 3],
			complexity: ['warn', 10]
		}
	}
];
