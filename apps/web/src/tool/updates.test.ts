import { expect, test, vi } from 'vite-plus/test';
import securityJson from '../../public/security.json?raw';
import { checkSafety } from './updates.ts';

/** Answers every `fetch` with `body`, as `/security.json` would. */
function serve(body: string): void {
	vi.stubGlobal('fetch', async () => new Response(body));
}

test('the security.json this repo deploys lets this build run', async () => {
	serve(securityJson);

	expect(await checkSafety()).toBe('ok');
});

test.each([
	['this build', __BUILD_NUMBER__, 'ok'],
	['an older build', __BUILD_NUMBER__ - 1, 'ok'],
	['a newer build', __BUILD_NUMBER__ + 1, 'unsafe']
])('a minimum safe build of %s makes this one %s', async (_, minSafeBuild, safety) => {
	serve(JSON.stringify({ minSafeBuild }));

	expect(await checkSafety()).toBe(safety);
});

test.each(['{}', '{ "minSafeBuild": "0" }', '{ "minSafeBuild": null }'])(
	'a minimum safe build that isn’t a number makes this build unsafe: %s',
	async (body) => {
		serve(body);

		expect(await checkSafety()).toBe('unsafe');
	}
);

test('offline, whether this build is safe is unknown', async () => {
	vi.stubGlobal('fetch', async () => {
		throw new TypeError('Failed to fetch');
	});

	expect(await checkSafety()).toBe('unknown');
});

test('an answer that isn’t JSON, like a captive portal’s page, leaves it unknown', async () => {
	serve('<!doctype html><title>Sign in to Wi-Fi</title>');

	expect(await checkSafety()).toBe('unknown');
});
