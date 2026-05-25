import eslintConfig from '@axiumine/eslint-config-be';

export default [
	{
		ignores: ['dist/**', 'node_modules/**', '.qodana/**', 'coverage/**']
	},
	...eslintConfig
];
