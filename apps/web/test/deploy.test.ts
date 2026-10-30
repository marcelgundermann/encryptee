import { dirname, resolve } from 'node:path';
import { resolveConfig } from 'vite';
import { expect, test } from 'vite-plus/test';
import { experimental_readRawConfig } from 'wrangler';

const WEB = resolve(import.meta.dirname, '..');

test('Wrangler serves the folder Vite builds into', async () => {
	// The example, since the real wrangler.jsonc isn't committed; CI copies it as it is.
	const { rawConfig, configPath } = experimental_readRawConfig({
		config: resolve(WEB, '../../wrangler.example.jsonc')
	});

	const vite = await resolveConfig({ root: WEB }, 'build');

	expect(resolve(dirname(configPath ?? ''), rawConfig.assets?.directory ?? '')).toBe(
		resolve(vite.root, vite.build.outDir)
	);
});
