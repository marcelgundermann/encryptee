import { defineConfig } from 'vite-plus';

/**
 * Vite+ tasks only; Vitest reads `vitest.config.ts` and the bench
 * `bench/vite.config.ts`. `test` stays a package.json script, never cached:
 * it runs the real `age` CLI and browsers, which the cache can't fingerprint.
 */
export default defineConfig({
	run: {
		tasks: {
			typecheck: 'tsc -p tsconfig.json && tsc -p tsconfig.worker.json'
		}
	}
});
