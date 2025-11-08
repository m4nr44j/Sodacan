module.exports = {
	env: {
		node: true,
		es2021: true,
	},
	extends: [],
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
	rules: {},
	overrides: [
		{
			files: ['testing/**/*'],
			excludedFiles: '*.*',
		},
	],
}