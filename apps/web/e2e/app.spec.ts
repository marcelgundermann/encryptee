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

async function dropFile(page: Page, name: string, buffer: Buffer): Promise<void> {
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

/** Encrypts with the generated passphrase, then decrypts with it. */
async function roundTrip(page: Page, plain: Buffer): Promise<Buffer> {
	await dropFile(page, 'photo.jpg', plain);
	await expect(page.getByText('Encrypting 1 file')).toBeVisible();
	const passphrase = (await page.locator('#encrypt-generated').textContent())!;
	expect(passphrase.split('-')).toHaveLength(10);
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file →' }).click();
	const encryptedDownload = await encrypted;
	expect(encryptedDownload.suggestedFilename()).toBe('photo.jpg.age');
	const sealed = await readFile(await encryptedDownload.path());
	expect(sealed.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
	await expect(page.getByRole('heading', { name: '1 file encrypted.' })).toBeVisible();

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'photo.jpg.age', sealed);
	await expect(page.getByRole('heading', { name: 'Locked with a passphrase.' })).toBeVisible();
	await page.locator('#decrypt-passphrase').fill(passphrase);
	const decrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Decrypt →' }).click();
	const decryptedDownload = await decrypted;
	expect(decryptedDownload.suggestedFilename()).toBe('photo.jpg');
	await expect(page.getByRole('heading', { name: '1 file decrypted.' })).toBeVisible();
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

test('a wrong passphrase is rejected on the card, before anything is saved', async ({ page }) => {
	await page.addInitScript(hidePickers);
	await page.goto('/');
	await waitForServiceWorker(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	await page.getByRole('button', { name: 'Use my own' }).click();
	await page.locator('#encrypt-own').fill('right');
	await page.locator('#encrypt-repeat').fill('right');
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file →' }).click();
	const sealed = await readFile(await (await encrypted).path());

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'a.txt.age', sealed);
	await page.locator('#decrypt-passphrase').fill('wrong');
	let downloads = 0;
	page.on('download', () => downloads++);
	await page.getByRole('button', { name: 'Decrypt →' }).click();
	await expect(
		page.getByText('That doesn’t match. Check the passphrase or key file.')
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Locked with a passphrase.' })).toBeVisible();
	expect(downloads).toBe(0);
});

test('public keys: create a key, encrypt to it, decrypt with the key file', async ({ page }) => {
	await page.addInitScript(hidePickers);
	await page.goto('/');
	await waitForServiceWorker(page);
	await page.getByRole('button', { name: 'Keys' }).click();
	await page.getByRole('button', { name: 'Create my key' }).click();
	const keyPassphrase = (await page.locator('#keys-generated').textContent())!;
	const savedKey = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save key file' }).click();
	const keyDownload = await savedKey;
	expect(keyDownload.suggestedFilename()).toBe('key.age');
	const keyFile = await readFile(await keyDownload.path());
	const publicKey = (await page.getByText(/^age1pq1/).textContent())!;

	await page.getByRole('button', { name: 'encryptee' }).click();
	const plain = randomBytes(300_000);
	await dropFile(page, 'notes.txt', plain);
	await page.getByRole('radio', { name: 'People' }).check({ force: true });
	await page.locator('#encrypt-paste').fill(publicKey);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file →' }).click();
	const sealed = await readFile(await (await encrypted).path());

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'notes.txt.age', sealed);
	await expect(page.getByRole('heading', { name: 'Locked with a key.' })).toBeVisible();
	await page.locator('input[type=file][aria-label="Choose your key file"]').setInputFiles({
		name: 'key.age',
		mimeType: 'application/octet-stream',
		buffer: keyFile
	});
	await page.locator('#decrypt-key-passphrase').fill(keyPassphrase);
	await page.getByRole('button', { name: 'Unlock' }).click();
	await expect(page.getByText('Key loaded from key.age')).toBeVisible();
	const decrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Decrypt →' }).click();
	const output = await readFile(await (await decrypted).path());
	expect(output.equals(plain)).toBe(true);
});
