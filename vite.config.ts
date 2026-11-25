import { defineConfig } from 'vite-plus';

/**
 * Vite+ for the whole workspace: Oxfmt and Oxlint settings (packages can't
 * nest their own), and the root's cached tasks. Each package defines its
 * own tasks in its `vite.config.ts`.
 */
export default defineConfig({
	run: {
		tasks: {
			'fmt:check': 'vp fmt --check',
			lint: 'vp lint --deny-warnings',
			knip: 'knip'
		}
	},
	fmt: {
		useTabs: true,
		singleQuote: true,
		trailingComma: 'none',
		printWidth: 100,
		ignorePatterns: [
			'pnpm-lock.yaml',
			'apps/web/src/routeTree.gen.ts'
		]
	},
	// No type-aware rules or typeCheck: tsgolint reads only each package's
	// tsconfig.json, so it misjudges files under tsconfig.sw/node/worker.json.
	// `tsc` typechecks every tsconfig instead (the packages' typecheck tasks).
	lint: {
		plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'react', 'jsx-a11y', 'vitest'],
		jsPlugins: [
			{
			},
			{
				name: 'vite-plus',
				specifier: 'vite-plus/oxlint-plugin'
			}
		],
		categories: {
			correctness: 'error',
			suspicious: 'warn',
			perf: 'warn'
		},
		env: {
			browser: true,
			worker: true,
			serviceworker: true,
			es2024: true
		},
		rules: {
			'no-console': [
				'warn',
				{
					allow: ['warn', 'error', 'info']
				}
			],
			'no-empty': [
				'error',
				{
					allowEmptyCatch: true
				}
			],
			'import/no-cycle': 'error',
			'typescript/consistent-type-imports': 'error',
			'react/react-in-jsx-scope': 'off',
			'no-await-in-loop': 'off',
			'unicorn/prefer-add-event-listener': 'off',
			'unicorn/require-post-message-target-origin': 'off',
			'no-underscore-dangle': 'off',
			'import/no-unassigned-import': [
				'warn',
				{
					allow: ['**/trusted-types.ts', '**/*.css']
				}
			],
			'react/no-array-index-key': 'off',
			'oxc/no-accumulating-spread': 'error',
			'vite-plus/prefer-vite-plus-imports': 'error'
		},
		ignorePatterns: [
			'**/dist/**',
			'apps/web/src/routeTree.gen.ts',
			'.worktrees/**',
			'**/node_modules/**'
		]
	}
});
