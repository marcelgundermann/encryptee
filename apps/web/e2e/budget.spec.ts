import { brotliCompressSync } from 'node:zlib';
import { expect, test, type Browser, type Response } from '@playwright/test';

/** The tool and the content pages. */
const ROUTES = ['/', '/how-it-works', '/security', '/faq'];

/** The most a cold load fetches, in bytes after Brotli at its highest level. */
const BUDGET = { js: 150_000, routeJs: 50_000, css: 20_000 };

/** What a cold load fetched: the compressed size of each file, by path. */
interface Fetched {
	js: Map<string, number>;
	css: Map<string, number>;
}

async function record(files: Map<string, number>, response: Response): Promise<void> {
	files.set(new URL(response.url()).pathname, brotliCompressSync(await response.body()).length);
}

/** Loads a route in a fresh context, so nothing is cached, until the network is quiet. */
async function loadCold(browser: Browser, baseURL: string, route: string): Promise<Fetched> {
	const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
	const page = await context.newPage();
	const fetched: Fetched = { js: new Map(), css: new Map() };
	const reads: Promise<void>[] = [];

	page.on('response', (response) => {
		const type = response.headers()['content-type'] ?? '';

		if (type.includes('javascript')) reads.push(record(fetched.js, response));
		else if (type.includes('css')) reads.push(record(fetched.css, response));
	});

	await page.goto(route, { waitUntil: 'networkidle' });
	await expect(page.locator('main')).toBeVisible();
	await Promise.all(reads);
	await context.close();

	return fetched;
}

const total = (files: Map<string, number>) =>
	[...files.values()].reduce((sum, size) => sum + size, 0);

// A compressed body is the same in every browser, and only Chromium blocks service
// workers, whose precache would count every file as part of a cold load.
test.skip(({ browserName }) => browserName !== 'chromium', 'the budget is measured in Chromium');

for (const route of ROUTES) {
	test(`a cold load of ${route} stays within the JS and CSS budgets`, async ({
		browser,
		baseURL
	}) => {
		const { js, css } = await loadCold(browser, baseURL!, route);
		// A page that fetched nothing would pass the limits without measuring anything.
		expect(js.size).toBeGreaterThan(0);
		expect(css.size).toBeGreaterThan(0);
		expect(total(js), `JS: ${JSON.stringify([...js])}`).toBeLessThanOrEqual(BUDGET.js);
		expect(total(css), `CSS: ${JSON.stringify([...css])}`).toBeLessThanOrEqual(BUDGET.css);
	});
}

test('what a route adds to the JS every route loads stays within its budget', async ({
	browser,
	baseURL
}) => {
	const loads = await Promise.all(
		ROUTES.map(async (route) => ({ route, js: (await loadCold(browser, baseURL!, route)).js }))
	);

	for (const { route, js } of loads) {
		const own = [...js].filter(([path]) => !loads.every((load) => load.js.has(path)));
		expect(total(new Map(own)), `${route} adds ${JSON.stringify(own)}`).toBeLessThanOrEqual(
			BUDGET.routeJs
		);
	}
});
