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
			'docs/research/**',
			'.agent/**',
			'.agents/**',
			'.claude/**',
			'.codex/**',
			'.continue/**',
			'.cursor/**',
			'.gemini/**',
			'.grok/**',
			'.opencode/**',
			'.pi/**',
			'.roo/**',
			'.windsurf/**',
			'tools/oxlint/anti-slop/**'
		]
	},
	// No type-aware rules or typeCheck: tsgolint reads only each package's
	// tsconfig.json, so it misjudges files under tsconfig.sw/node/worker.json.
	// `tsc` typechecks every tsconfig instead (the packages' typecheck tasks).
	lint: {
		plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'react', 'jsx-a11y', 'vitest'],
		jsPlugins: [
			{
				name: 'anti-slop',
				specifier: './tools/oxlint/anti-slop/index.ts'
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
			'anti-slop/no-array-filter-map': 'error',
			'anti-slop/no-reduce-accumulator-copy': 'error',
			'anti-slop/no-chained-type-assertions': 'error',
			'anti-slop/no-conditional-empty-object-spread': 'error',
			'anti-slop/no-known-value-widening': 'error',
			'anti-slop/no-module-mocking': 'error',
			'anti-slop/no-object-parameters': 'error',
			'anti-slop/no-reflect-apply': 'error',
			'anti-slop/no-reflect-get': 'error',
			'anti-slop/no-runtime-typeof': 'error',
			'anti-slop/no-shape-in-symbol-names': 'error',
			'anti-slop/no-unknown-parameters': 'error',
			'anti-slop/no-unknown-returns': 'error',
			'anti-slop/no-unknown-type-aliases': 'error',
			'anti-slop/no-unsafe-dictionary-type': 'error',
			'anti-slop/no-widen-then-assert': 'error',
			'anti-slop/require-readable-spacing': 'error',
			'anti-slop/require-safety-comment-for-type-assertion': 'error',
			'vite-plus/prefer-vite-plus-imports': 'error'
		},
		ignorePatterns: [
			'**/dist/**',
			'docs/research/**',
			'.worktrees/**',
			'**/node_modules/**',
			'.agent/**',
			'.agents/**',
			'.claude/**',
			'.codex/**',
			'.continue/**',
			'.cursor/**',
			'.gemini/**',
			'.grok/**',
			'.opencode/**',
			'.pi/**',
			'.roo/**',
			'.windsurf/**',
			'tools/oxlint/anti-slop/**'
		]
	}
});
