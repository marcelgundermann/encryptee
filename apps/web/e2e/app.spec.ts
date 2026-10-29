import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Native pickers can't be automated, so these tests hide them and exercise
 * the paths Firefox and Safari use: the service-worker download and OPFS.
 */
const hidePickers = () => {
	const pickers = window as { showSaveFilePicker?: unknown; showDirectoryPicker?: unknown };
	delete pickers.showSaveFilePicker;
	delete pickers.showDirectoryPicker;
};

/** Records CSP and Trusted Types violations for the whole test. */
function watchCsp(page: Page): string[] {
	const violations: string[] = [];
	page.on('console', (message) => {
		if (/Content.Security.Policy|Trusted Type|TrustedScriptURL/i.test(message.text())) {
			violations.push(message.text());
		}
	});
	return violations;
}

async function waitForServiceWorker(page: Page): Promise<void> {
	await page.waitForFunction(async () => {
		await navigator.serviceWorker.ready;
		return navigator.serviceWorker.controller !== null;
	});
}

async function roundTrip(page: Page, plain: Buffer): Promise<Buffer> {
	const passphrase = 'correct horse battery staple';

	await page
		.locator('input[type=file]')
		.setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: plain });
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	await page.getByLabel('Repeat passphrase').fill(passphrase);
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
	const encryptedDownload = await encrypted;
	expect(encryptedDownload.suggestedFilename()).toBe('photo.jpg.age');
	const sealed = await readFile(await encryptedDownload.path());
	expect(sealed.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
	await expect(page.getByTestId('job-files').locator('[data-status=done]')).toHaveCount(1);

	await page.getByRole('button', { name: 'Start over' }).click();
	await page
		.locator('input[type=file]')
		.setInputFiles({ name: 'photo.jpg.age', mimeType: 'application/octet-stream', buffer: sealed });
	await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
	const decrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	const decryptedDownload = await decrypted;
	expect(decryptedDownload.suggestedFilename()).toBe('photo.jpg');
	return readFile(await decryptedDownload.path());
}

test('content pages are static HTML without scripts', async ({ page }) => {
	const violations = watchCsp(page);
	for (const path of ['/how-it-works/', '/security/', '/faq/']) {
		await page.goto(path);
		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('script')).toHaveCount(0);
	}
	expect(violations).toEqual([]);
});

test('encrypt and decrypt round trip through the service-worker download', async ({ page }) => {
	const violations = watchCsp(page);
	await page.addInitScript(hidePickers);
	await page.goto('/');
	await waitForServiceWorker(page);
	const plain = randomBytes(3 * 1024 * 1024 + 17);
	expect((await roundTrip(page, plain)).equals(plain)).toBe(true);
	expect(violations).toEqual([]);
});

test('works offline once installed', async ({ page, context }) => {
	await page.addInitScript(hidePickers);
	await page.goto('/');
	await waitForServiceWorker(page);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText('Choose files')).toBeVisible();
	await waitForServiceWorker(page);
	const plain = randomBytes(200_000);
	expect((await roundTrip(page, plain)).equals(plain)).toBe(true);
});

test.describe('without a service worker', () => {
	test.use({ serviceWorkers: 'block' });

	test('falls back to OPFS staging', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'serviceWorkers: block is Chromium-only');
		const violations = watchCsp(page);
		await page.addInitScript(hidePickers);
		await page.goto('/');
		const plain = randomBytes(1024 * 1024 + 3);
		expect((await roundTrip(page, plain)).equals(plain)).toBe(true);
		expect(violations).toEqual([]);
	});
});

test('a wrong passphrase is reported and nothing is downloaded', async ({ page }) => {
	await page.addInitScript(hidePickers);
	await page.goto('/');
	await waitForServiceWorker(page);
	await page
		.locator('input[type=file]')
		.setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: randomBytes(1000) });
	await page.getByLabel('Passphrase', { exact: true }).fill('right');
	await page.getByLabel('Repeat passphrase').fill('right');
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt', exact: true }).click();
	const sealed = await readFile(await (await encrypted).path());

	await page.getByRole('button', { name: 'Start over' }).click();
	await page
		.locator('input[type=file]')
		.setInputFiles({ name: 'a.txt.age', mimeType: 'application/octet-stream', buffer: sealed });
	await page.getByLabel('Passphrase', { exact: true }).fill('wrong');
	let downloads = 0;
	page.on('download', () => downloads++);
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	await expect(page.getByText('The passphrase or key doesn’t match this file.')).toBeVisible();
	expect(downloads).toBe(0);
});
