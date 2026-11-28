import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** The content pages' addresses. */
const PAGES = ['/how-it-works', '/security', '/faq'];

/**
 * Native pickers can't be automated, so these tests hide them and exercise
 * the path Firefox and Safari use: the service-worker download.
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

test('content pages and the not-found page render without CSP violations', async ({ page }) => {
	const violations = watchCsp(page);

	// A path that doesn't exist gets the app, through `not_found_handling`, which routes it.
	for (const path of [...PAGES, '/no-such-page']) {
		await page.goto(path);
		await expect(page.locator('h1')).toBeVisible();
	}

	expect(violations).toEqual([]);
});

test('a header link opens a content page without reloading the document', async ({ page }) => {
	await page.goto('/');
	// Gone if the document reloads; React renders only inside #root.
	await page.evaluate(() => (document.documentElement.dataset.loaded = 'once'));
	await page.getByRole('link', { name: 'FAQ' }).click();
	await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-loaded', 'once');
});

/** Ways to leave a content page's document and come back to it, the same one in history. */
const RETURNS: [way: string, leaveAndReturn: (page: Page) => Promise<void>][] = [
	[
		'a reload',
		async (page) => {
			await page.reload();
		}
	],
	[
		'Back from another site',
		async (page) => {
			await page.goto('data:text/html,Another site');
			await page.goBack();
		}
	]
];

for (const [way, leaveAndReturn] of RETURNS) {
	test(`${way} keeps where a content page was scrolled`, async ({ page }) => {
		await page.setViewportSize({ width: 800, height: 400 });
		await page.goto('/security');
		await expect(page.locator('main')).toBeVisible();
		await page.evaluate(() => window.scrollTo(0, 700));
		// The router notes the scroll on its event, which comes with the next frame.
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
		await leaveAndReturn(page);
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(700);
	});
}

for (const [path, title] of [
	['/', 'Encryptee · Encrypt files in your browser'],
	['/faq', 'Encryptee FAQ'],
	['/faq/more', 'Page not found · Encryptee']
] as const) {
	test(`the document’s title names the page at ${path}`, async ({ page }) => {
		await page.goto(path);
		await expect(page.locator('main')).toBeVisible();
		await expect(page).toHaveTitle(title);
	});
}

/** What `_headers` sends with every response. Weakening one is a change to this list too. */
const SECURITY_HEADERS = {
	'content-security-policy':
		"default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types default",
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'referrer-policy': 'no-referrer',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'permissions-policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()'
};

test('the tool, a content page and the not-found page get the security headers', async ({
	request
}) => {
	for (const path of ['/', '/faq', '/no-such-page']) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		expect(response.headers(), path).toMatchObject(SECURITY_HEADERS);
	}
});

test('the tool, a content page and the not-found page forbid changing them on the way', async ({
	request
}) => {
	for (const path of ['/', '/faq', '/no-such-page']) {
		const { 'cache-control': cacheControl } = (await request.get(path)).headers();
		expect(cacheControl, path).toBe('public, max-age=0, must-revalidate, no-transform');
	}
});

test('an asset is cached for good, and the service worker’s script is always checked', async ({
	request
}) => {
	const [asset] = (await (await request.get('/')).text()).match(/\/assets\/[^"]+\.js/) ?? [];
	expect(asset).toBeDefined();

	for (const [path, expected] of [
		[asset!, 'public, max-age=31536000, immutable'],
		['/sw.js', 'no-cache']
	] as const) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		expect(response.headers()['cache-control'], path).toBe(expected);
	}
});

test('encrypt and decrypt round trip through the service-worker download', async ({ page }) => {
	const violations = watchCsp(page);
	await openTool(page);
	const plain = randomBytes(3 * 1024 * 1024 + 17);
	expect((await roundTrip(page, plain)).equals(plain)).toBe(true);
	expect(violations).toEqual([]);
});

test('a streamed download keeps a name with accents, quotes and parentheses', async ({
	page,
	browserName
}) => {
	test.skip(
		browserName === 'webkit' && process.platform === 'linux',
		'WebKit on Linux suggests the name with _ for the space'
	);
	await openTool(page);
	await dropFile(page, "Müller's (1).txt", randomBytes(1000));
	const encrypted = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	// WebKit on a Mac reports the ü decomposed, as the file system stores it.
	expect((await encrypted).suggestedFilename().normalize('NFC')).toBe("Müller's (1).txt.age");
});

test('a download the browser never fetches is a failed save, never a saved file', async ({
	page
}) => {
	await openTool(page);
	// The hidden iframe never navigates, so the browser never asks for the download.
	await page.evaluate(() =>
		Object.defineProperty(HTMLIFrameElement.prototype, 'src', { set() {} })
	);
	await dropFile(page, 'a.txt', randomBytes(1000));
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	// The browser gets 30 seconds to fetch it.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Couldn’t encrypt.', {
		timeout: 60_000
	});
	await expect(page.getByRole('paragraph').filter({ hasText: 'Saving failed.' })).toBeVisible();
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

test('content pages open offline once installed', async ({ page, context }) => {
	await openTool(page);
	await context.setOffline(true);
	await page.goto('/faq');
	await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
});

test.describe('without a service worker', () => {
	test.use({ serviceWorkers: 'block' });

	test('saving asks to reload the page', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'serviceWorkers: block is Chromium-only');
		await page.addInitScript(hidePickers);
		await page.goto('/');
		await dropFile(page, 'a.txt', randomBytes(1000));
		await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
		await expect(page.getByRole('alert')).toContainText('Reload the page');
	});
});

test('the generated passphrase is left out of page translation', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	await expect(page.locator('#encrypt-generated')).toHaveAttribute('translate', 'no');
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

	await page.getByRole('button', { name: 'Close' }).click();
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

/** A valid X25519 public key. */
const X25519_KEY = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';

test('a public key pasted but not added is still encrypted to', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'notes.txt', randomBytes(1000));
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	await page.locator('#encrypt-paste').fill(X25519_KEY);
	const submit = page.getByRole('button', { name: 'Encrypt 1 file' });
	await expect(submit).toBeEnabled();
	const encrypted = page.waitForEvent('download');
	await submit.click();
	const sealed = await readFile(await (await encrypted).path());
	expect(sealed.toString('latin1')).toContain('\n-> X25519 ');
});

const INVALID_KEY = 'That isn’t a valid public key.';

/** Drops a file, then adds text that isn't a public key on the encrypt card. Resolves with the error it shows. */
async function addInvalidKey(page: Page): Promise<Locator> {
	await openTool(page);
	await dropFile(page, 'notes.txt', randomBytes(1000));
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	await page.locator('#encrypt-paste').fill('not a key');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	return page.getByText(INVALID_KEY);
}

test('an error about a pasted key is gone once the method switches', async ({ page }) => {
	const error = await addInvalidKey(page);
	await expect(error).toBeVisible();
	await page.getByRole('radio', { name: 'Passphrase' }).check({ force: true });
	await expect(error).toBeHidden();
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	await expect(error).toBeHidden();
});

test('editing a pasted key clears the error about it', async ({ page }) => {
	const error = await addInvalidKey(page);
	await expect(error).toBeVisible();
	await page.locator('#encrypt-paste').press('x');
	await expect(error).toBeHidden();
});

test('a pasted key that isn’t valid marks the paste field invalid, described by the error', async ({
	page
}) => {
	await addInvalidKey(page);
	const paste = page.locator('#encrypt-paste');
	await expect(paste).toHaveAttribute('aria-invalid', 'true');
	await expect(paste).toHaveAccessibleDescription(INVALID_KEY);
});

test('the paste field, once its error clears, is no longer marked invalid', async ({ page }) => {
	const error = await addInvalidKey(page);
	await expect(error).toBeVisible();
	const paste = page.locator('#encrypt-paste');
	await paste.press('x');
	await expect(paste).not.toHaveAttribute('aria-invalid');
	await expect(paste).toHaveAccessibleDescription('');
});

test('editing the paste field leaves an error from saving up', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'notes.txt', randomBytes(1000));
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	const paste = page.locator('#encrypt-paste');
	await paste.fill(X25519_KEY);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(paste).toHaveValue('');
	await page.evaluate(() =>
		Reflect.set(window, 'showSaveFilePicker', async () => {
			throw new Error('broken');
		})
	);

	const error = page.getByRole('alert').filter({ hasText: 'Saving failed.' });
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	await expect(error).toBeVisible();
	await paste.press('x');
	await expect(error).toBeVisible();
});

/**
 * Puts in a save picker that stays open until the test answers it through
 * the handle, which holds the Encrypt clicked before then in flight, as the
 * paste field's check does for a moment. Put it in after the drop: the
 * capability is read at the click.
 */
async function holdSavePicker(page: Page) {
	return page.evaluateHandle(() => {
		const held = { shown: 0, answer: Promise.withResolvers<unknown>() };

		Reflect.set(window, 'showSaveFilePicker', () => {
			held.shown++;

			return held.answer.promise;
		});

		return held;
	});
}

test('an Encrypt left behind by a method switch shows no error', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	const picker = await holdSavePicker(page);
	await page.getByRole('button', { name: 'Encrypt 1 file' }).click();
	await expect.poll(() => picker.evaluate((held) => held.shown)).toBe(1);
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	await picker.evaluate((held) => held.answer.reject(new Error('broken')));
	// The picker's answer reaches the card within a frame or two.
	await page.waitForTimeout(500);
	await expect(page.getByRole('alert').filter({ hasText: 'Saving failed.' })).toBeHidden();
});

test('an Encrypt left behind by a method switch starts no job', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));
	const picker = await holdSavePicker(page);
	const submit = page.getByRole('button', { name: 'Encrypt 1 file' });
	await submit.click();
	await expect.poll(() => picker.evaluate((held) => held.shown)).toBe(1);
	await page.getByRole('radio', { name: 'Public keys' }).check({ force: true });
	// A job would replace the card at once, before it writes to the file.
	await picker.evaluate((held) => held.answer.resolve({}));
	await page.waitForTimeout(500);
	await expect(submit).toBeVisible();
});

test('a save picker dismissed after one that failed leaves no error', async ({ page }) => {
	await openTool(page);
	await dropFile(page, 'a.txt', randomBytes(1000));

	// The first picker breaks, and the user closes the second.
	const picker = await page.evaluateHandle(() => {
		const state = { shown: 0 };

		Reflect.set(window, 'showSaveFilePicker', async () => {
			state.shown++;

			throw state.shown === 1 ? new Error('broken') : new DOMException('', 'AbortError');
		});

		return state;
	});

	const submit = page.getByRole('button', { name: 'Encrypt 1 file' });
	const error = page.getByRole('alert').filter({ hasText: 'Saving failed.' });
	await submit.click();
	await expect(error).toBeVisible();
	await submit.click();
	await expect.poll(async () => (await picker.jsonValue()).shown).toBe(2);
	await expect(submit).toBeEnabled();
	await expect(error).toBeHidden();
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

test('a dropped folder is refused, and says why', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'only Chromium’s DevTools can drop a folder from disk');
	await openTool(page);
	const folder = await mkdtemp(join(tmpdir(), 'encryptee-folder-'));
	await writeFile(join(folder, 'a.txt'), 'inside the folder');

	try {
		const devtools = await page.context().newCDPSession(page);
		const data = { items: [], files: [folder], dragOperationsMask: 1 };

		for (const type of ['dragEnter', 'dragOver', 'drop'] as const)
			await devtools.send('Input.dispatchDragEvent', { type, x: 300, y: 300, data });

		await expect(page.getByRole('alert')).toHaveText(
			'Encryptee works on files, not folders. Drop the files inside it instead.'
		);
	} finally {
		await rm(folder, { recursive: true });
	}
});

test('Keys, closed with Esc, opens again', async ({ page }) => {
	await openTool(page);
	const open = page.getByRole('button', { name: 'Keys' });
	const dialog = page.getByRole('dialog', { name: 'Keys' });
	await open.click();
	await expect(dialog).toBeVisible();
	// The browser hides the dialog by itself; only its `close` event lets it open again.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await open.click();
	await expect(dialog).toBeVisible();
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

	await page.getByRole('button', { name: 'Close' }).click();
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
	await page.locator('#encrypt-paste').fill(X25519_KEY);
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
