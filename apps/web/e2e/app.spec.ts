import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { PAGES } from '../pages.ts';

/**
 * Native pickers can't be automated, so these tests hide them and exercise
 * the paths Firefox and Safari use: the service-worker download and OPFS.
 */
const hidePickers = () => {
	Reflect.deleteProperty(window, 'showSaveFilePicker');
	Reflect.deleteProperty(window, 'showDirectoryPicker');
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

/** Opens the tool without its native pickers, once a service worker controls it. */
async function openTool(page: Page): Promise<void> {
	await page.addInitScript(hidePickers);
	await page.goto('/');
	await waitForServiceWorker(page);
}

async function dropFile(page: Page, name: string, buffer: Buffer): Promise<void> {
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

/** Drops a file on the window, as dragging it in from the desktop does, onto whatever step is shown. */
async function dropOnWindow(page: Page, name: string, buffer: Buffer): Promise<void> {
	const dataTransfer = await page.evaluateHandle(
		({ fileName, bytes }) => {
			const transfer = new DataTransfer();
			transfer.items.add(new File([new Uint8Array(bytes)], fileName));

			return transfer;
		},
		{ fileName: name, bytes: [...buffer] }
	);

	await page.dispatchEvent('body', 'drop', { dataTransfer });
}

/** Encrypts with the generated passphrase, then decrypts with it. */
async function roundTrip(page: Page, plain: Buffer): Promise<Buffer> {
	await dropFile(page, 'photo.jpg', plain);
	await expect(page.getByText('Encrypting 1 file')).toBeVisible();
	const passphrase = (await page.locator('#encrypt-generated').textContent())!;
	expect(passphrase.split('-')).toHaveLength(10);
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	const encryptedDownload = await encrypted;
	expect(encryptedDownload.suggestedFilename()).toBe('photo.jpg.age');
	const sealed = await readFile(await encryptedDownload.path());
	expect(sealed.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
	await expect(page.getByRole('heading', { name: '1 file encrypted.' })).toBeVisible();

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'photo.jpg.age', sealed);
	await expect(page.getByRole('heading', { name: 'Encrypted with a passphrase.' })).toBeVisible();
	await page.locator('#decrypt-passphrase').fill(passphrase);
	const decrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	const decryptedDownload = await decrypted;
	expect(decryptedDownload.suggestedFilename()).toBe('photo.jpg');
	await expect(page.getByRole('heading', { name: '1 file decrypted.' })).toBeVisible();

	return readFile(await decryptedDownload.path());
}

test('content pages and the 404 page render without CSP violations', async ({ page }) => {
	const violations = watchCsp(page);

	// A path that doesn't exist gets 404.html, through `not_found_handling`.
	for (const path of [...PAGES.map((name) => `/${name}/`), '/no-such-page/']) {
		await page.goto(path);
		await expect(page.locator('h1')).toBeVisible();
	}

	expect(violations).toEqual([]);
});

/** What `_headers` sends with every response. Weakening one is a change to this list too. */
const SECURITY_HEADERS = {
	'content-security-policy':
		"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types default",
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'referrer-policy': 'no-referrer',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'permissions-policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()'
};

test('the tool, a content page and the 404 page get the security headers', async ({ request }) => {
	for (const [path, status] of [
		['/', 200],
		['/faq/', 200],
		['/no-such-page/', 404]
	] as const) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(status);
		expect(response.headers(), path).toMatchObject(SECURITY_HEADERS);
	}
});

test('encrypt and decrypt round trip through the service-worker download', async ({ page }) => {
	const violations = watchCsp(page);
	await openTool(page);
	const plain = randomBytes(3 * 1024 * 1024 + 17);
	expect((await roundTrip(page, plain)).equals(plain)).toBe(true);
	expect(violations).toEqual([]);
});

test('works offline once installed', async ({ page, context }) => {
	await openTool(page);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText('Choose files', { exact: true })).toBeVisible();
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

test('the generated passphrase is left out of page translation', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	await expect(page.locator('#encrypt-generated')).toHaveAttribute('translate', 'no');
});

test('a legacy file links to v1.encryptee.io, where it opens', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'report.pdf.cre', Buffer.from(`encryptee.io${'x'.repeat(100)}`));
	await expect(page.getByRole('link', { name: 'v1.encryptee.io' })).toHaveAttribute(
		'href',
		'https://v1.encryptee.io'
	);
});

test('a wrong passphrase is rejected on the card, before anything is saved', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	await page.getByRole('button', { name: 'Use my own' }).click();
	await page.locator('#encrypt-own').fill('right');
	await page.locator('#encrypt-repeat').fill('right');
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	const sealed = await readFile(await (await encrypted).path());

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'a.txt.age', sealed);
	await page.locator('#decrypt-passphrase').fill('wrong');
	let downloads = 0;
	page.on('download', () => downloads++);
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	// The check runs scrypt at full strength, which takes seconds on a slow machine.
	await expect(page.getByText('That doesn’t match. Check the passphrase or key file.')).toBeVisible(
		{ timeout: 30_000 }
	);
	await expect(page.getByRole('heading', { name: 'Encrypted with a passphrase.' })).toBeVisible();
	expect(downloads).toBe(0);
});

test('a changed file, decrypted through the service-worker download, downloads nothing', async ({
	page
}) => {
	await openTool(page);
	// Several batches, so a download that started would still be streaming when the last one fails.
	await dropFile(page, 'video.mp4', randomBytes(16 * 1024 * 1024 + 5));
	const passphrase = (await page.locator('#encrypt-generated').textContent())!;
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	const sealed = await readFile(await (await encrypted).path());
	sealed[sealed.length - 1]! ^= 1;

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'video.mp4.age', sealed);
	await page.locator('#decrypt-passphrase').fill(passphrase);
	let downloads = 0;
	page.on('download', () => downloads++);
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Couldn’t decrypt.' })).toBeVisible();
	await expect(
		page.getByRole('paragraph').filter({ hasText: 'This file was changed or is incomplete.' })
	).toBeVisible();
	// A download the job started would have been announced by now.
	await page.waitForTimeout(1000);
	expect(downloads).toBe(0);
});

test('public keys: create a key, encrypt to it, decrypt with the key file', async ({ page }) => {
	await openTool(page);
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
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	await page.locator('#encrypt-paste').fill(publicKey);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	const sealed = await readFile(await (await encrypted).path());

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'notes.txt.age', sealed);
	await expect(page.getByRole('heading', { name: 'Encrypted to a public key.' })).toBeVisible();
	await page.locator('input[type=file][aria-label="Choose your key file"]').setInputFiles({
		name: 'key.age',
		mimeType: 'application/octet-stream',
		buffer: keyFile
	});
	await page.locator('#decrypt-key-passphrase').fill(keyPassphrase);
	await page.getByRole('button', { name: 'Use key file' }).click();
	// Opening the protected key file runs scrypt at full strength.
	await expect(page.getByText('Key loaded from key.age')).toBeVisible({ timeout: 30_000 });
	const decrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	const output = await readFile(await (await decrypted).path());
	expect(output.equals(plain)).toBe(true);
});

/** Unpadded base64 of random bytes, as in an age header. */
const randomBase64 = (size: number) => randomBytes(size).toString('base64').replace(/=+$/, '');

test('a public key pasted but not added is still encrypted to', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'notes.txt', randomBytes(1000));
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	await page
		.locator('#encrypt-paste')
		.fill('age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p');
	const submit = page.getByRole('button', { name: 'Encrypt 1 file' });
	await expect(submit).toBeEnabled();
	const encrypted = page.waitForEvent('download');
	await submit.click();
	const sealed = await readFile(await (await encrypted).path());
	expect(sealed.toString('latin1')).toContain('\n-> X25519 ');
});

test('files dropped on a finished job never bring back the card before it', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	const sealed = await readFile(await (await encrypted).path());
	await expect(page.getByRole('heading', { name: '1 file encrypted.' })).toBeVisible();

	// Every heading the page shows from here on, however briefly.
	const headings = await page.evaluateHandle(() => {
		const seen: string[] = [];

		new MutationObserver(() => {
			for (const heading of document.querySelectorAll('h1')) seen.push(heading.textContent);
		}).observe(document.body, { childList: true, subtree: true });

		return seen;
	});

	await dropOnWindow(page, 'a.txt.age', sealed);
	await expect(page.getByRole('heading', { name: 'Encrypted with a passphrase.' })).toBeVisible();
	expect(await headings.jsonValue()).not.toContain('Encrypting 1 file');
});

test('a file that isn’t a key file leaves no key loaded', async ({ page }) => {
	await openTool(page);
	await page.getByRole('button', { name: 'Keys' }).click();
	await page.getByRole('button', { name: 'Create my key' }).click();
	await page.getByRole('checkbox', { name: 'Protect it with a passphrase' }).uncheck();
	const savedKey = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Save key file' }).click();
	const keyDownload = await savedKey;
	const keyFile = await readFile(await keyDownload.path());

	await page.getByRole('button', { name: 'encryptee' }).click();
	const header = `age-encryption.org/v1\n-> X25519 ${randomBase64(32)}\n${randomBase64(32)}\n--- ${randomBase64(32)}\n`;
	await dropFile(page, 'notes.txt.age', Buffer.concat([Buffer.from(header), randomBytes(1000)]));
	const chooseKeyFile = page.locator('input[type=file][aria-label="Choose your key file"]');
	await chooseKeyFile.setInputFiles({
		name: keyDownload.suggestedFilename(),
		mimeType: 'text/plain',
		buffer: keyFile
	});
	await expect(page.getByText(`Key loaded from ${keyDownload.suggestedFilename()}`)).toBeVisible();

	await chooseKeyFile.setInputFiles({
		name: 'notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not a key')
	});
	await expect(page.getByText('That isn’t a valid key file.')).toBeVisible();
	await expect(page.getByText(/^Key loaded from/)).toBeHidden();
	await expect(page.getByRole('button', { name: 'Decrypt', exact: true })).toBeDisabled();
});

test('a double-click on Encrypt starts one job', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'notes.txt', randomBytes(1000));
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	// Checking the pasted key starts the key tools' worker, which gives the second click time to land.
	await page
		.locator('#encrypt-paste')
		.fill('age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p');
	let downloads = 0;
	page.on('download', () => downloads++);
	await page.getByRole('button', { name: 'Encrypt 1 file' }).dblclick();
	await expect(page.getByRole('heading', { name: '1 file encrypted.' })).toBeVisible();
	// A second job would download its copy right after the first.
	await page.waitForTimeout(1000);
	expect(downloads).toBe(1);
});

test('a passphrase changed while it’s checked stops the check, which never saves', async ({
	page
}) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	await page.getByRole('button', { name: 'Use my own' }).click();
	await page.locator('#encrypt-own').fill('right');
	await page.locator('#encrypt-repeat').fill('right');
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	const sealed = await readFile(await (await encrypted).path());

	await page.getByRole('button', { name: 'Do another' }).click();
	await dropFile(page, 'a.txt.age', sealed);
	await page.locator('#decrypt-passphrase').fill('right');
	let downloads = 0;
	page.on('download', () => downloads++);
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	// scrypt at full strength takes far longer than a keystroke.
	await page.locator('#decrypt-passphrase').press('x');
	await expect(page.getByRole('button', { name: 'Decrypt', exact: true })).toBeEnabled();
	await page.waitForTimeout(2000);
	await expect(page.getByText('That matches. Now choose where to save.')).toBeHidden();
	expect(downloads).toBe(0);

	await page.locator('#decrypt-passphrase').press('Backspace');
	const decrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Decrypt', exact: true }).click();
	expect((await decrypted).suggestedFilename()).toBe('a.txt');
});
