import eslintConfig from '@axiumine/eslint-config-be';

export default [
	{
		ignores: ['dist/**', 'dist-test/**', 'node_modules/**', '.qodana/**', 'coverage/**']
	},
	...eslintConfig
];
