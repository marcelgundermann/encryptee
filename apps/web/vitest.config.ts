import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Unit tests run in Node with the app's own Vite config, so `__BUILD_NUMBER__`
 * and the PWA's virtual modules resolve as in the build. Tests next to a module
 * in `src/` are typed as app code; `test/` holds the build's and deployment's,
 * typed for Node.
 */
export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			include: ['src/**/*.test.ts', 'test/**/*.test.ts']
		}
	})
);
