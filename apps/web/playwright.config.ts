import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `wrangler dev`, so the real
 * `_headers` (CSP, Trusted Types) apply. Build first: `pnpm build && pnpm e2e`.
 * It runs locally only; CI doesn't run it.
 * `BROWSERS=chromium,webkit` narrows the run; all three by default.
 */
const browsers = (process.env.BROWSERS ?? 'chromium,firefox,webkit').split(',');
const PORT = 8799;

export default defineConfig({
	testDir: 'e2e',
	timeout: 120_000,
	fullyParallel: true,
	use: { baseURL: `http://localhost:${PORT}`, acceptDownloads: true, trace: 'retain-on-failure' },
	webServer: {
		command: 'pnpm serve',
		url: `http://localhost:${PORT}`,
		reuseExistingServer: true
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	].filter((project) => browsers.includes(project.name))
});
