import { describe, expect, test } from 'vitest';
import type { Capabilities } from '../src/capabilities.ts';
import { startJob } from '../src/index.ts';
import { chooseSaveLocationIn, type SaveEnvironment } from '../src/sinks/save-location.ts';
import { decrypt, encrypt, equalBytes, file, passphrase, randomBytes } from './helpers.ts';

/** WebKit refuses OPFS in Playwright's ephemeral contexts, which is how Vitest runs it. */
const opfs = await navigator.storage.getDirectory().then(
	() => true,
	() => false
);

/** A fresh OPFS directory, standing in for a folder the user picked. */
async function pickedDirectory(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();

	return root.getDirectoryHandle(`picked-${crypto.randomUUID()}`, { create: true });
}

async function names(directory: FileSystemDirectoryHandle): Promise<string[]> {
	const found: string[] = [];

	for await (const name of directory.keys()) found.push(name);

	return found.toSorted();
}

async function writeFile(
	directory: FileSystemDirectoryHandle,
	name: string,
	contents: string
): Promise<FileSystemFileHandle> {
	const handle = await directory.getFileHandle(name, { create: true });
	const writable = await handle.createWritable();
	await writable.write(contents);
	await writable.close();

	return handle;
}

async function readFile(handle: FileSystemFileHandle): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

/** Encrypts `bytes` and flips a bit in the last chunk's tag. */
async function corrupted(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const sealed = await encrypt(bytes, passphrase.encrypt);
	sealed[sealed.length - 1]! ^= 1;

	return sealed;
}

describe('save location failures', () => {
	test(
		'a save that fails once the output is open fails the file and stops the job',
		{
			timeout: 10_000
		},
		async () => {
			// Nothing controls the test page, so the download can't be handed to a service worker.
			expect(navigator.serviceWorker?.controller ?? null).toBeNull();

			const result = await startJob({
				mode: 'encrypt',
				credentials: passphrase.encrypt,
				files: [file(randomBytes(100), 'a.txt'), file(randomBytes(100), 'b.txt')],
				save: { kind: 'sw-download' }
			}).done;

			expect(result.status).toBe('failed');
			expect(result.files.map((f) => f.status)).toEqual(['failed', 'cancelled']);
			expect(result.files[0]).toMatchObject({ status: 'failed', error: { code: 'save-failed' } });
		}
	);
});

describe.skipIf(!opfs)('picked files and folders', () => {
	test('a folder gets one file per input, renamed on a collision', async () => {
		const directory = await pickedDirectory();
		await writeFile(directory, 'a.txt.age', 'keep me');
		const plain = randomBytes(100);

		const result = await startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [file(plain, 'a.txt'), file(randomBytes(100), 'b.txt')],
			save: { kind: 'directory', handle: directory }
		}).done;

		expect(result.status).toBe('done');
		expect(result.files).toMatchObject([
			{ status: 'done', output: { kind: 'saved' } },
			{ status: 'done', output: { kind: 'saved' } }
		]);
		expect(await names(directory)).toEqual(['a (1).txt.age', 'a.txt.age', 'b.txt.age']);

		const kept = await readFile(await directory.getFileHandle('a.txt.age'));
		expect(new TextDecoder().decode(kept)).toBe('keep me');

		const sealed = await readFile(await directory.getFileHandle('a (1).txt.age'));
		expect(equalBytes((await decrypt(sealed, passphrase.decrypt)).output!, plain)).toBe(true);
	});

	test('a corrupted file removes only the output it created in the folder', async () => {
		const directory = await pickedDirectory();
		await writeFile(directory, 'other.txt', 'not ours');

		const result = await startJob({
			mode: 'decrypt',
			credentials: passphrase.decrypt,
			files: [
				file(await encrypt(randomBytes(100), passphrase.encrypt), 'a.txt.age'),
				file(await corrupted(randomBytes(100)), 'b.txt.age')
			],
			save: { kind: 'directory', handle: directory }
		}).done;

		expect(result.files.map((f) => f.status)).toEqual(['done', 'failed']);
		expect(result.files[1]).toMatchObject({ status: 'failed', error: { code: 'corrupted' } });
		expect(await names(directory)).toEqual(['a.txt', 'other.txt']);
	});

	test('a file changed since it was chosen fails as read-failed, and the files after it still run', async () => {
		const directory = await pickedDirectory();
		const handle = await writeFile(directory, 'changed.txt', 'as it was chosen');
		const changed = await handle.getFile();
		await writeFile(directory, 'changed.txt', 'as it is now, with more in it');

		const result = await startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [changed, file(randomBytes(100), 'b.txt')],
			save: { kind: 'memory' }
		}).done;

		expect(result.files).toMatchObject([
			{ status: 'failed', error: { code: 'read-failed' } },
			{ status: 'done' }
		]);
	});

	test('a folder deleted since it was picked fails the save', async () => {
		const directory = await pickedDirectory();
		await (await navigator.storage.getDirectory()).removeEntry(directory.name);

		const result = await startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [file(randomBytes(100), 'a.txt')],
			save: { kind: 'directory', handle: directory }
		}).done;

		expect(result.files[0]).toMatchObject({ status: 'failed', error: { code: 'save-failed' } });
	});

	test('a corrupted file leaves a picked file as it was', async () => {
		const directory = await pickedDirectory();
		const handle = await writeFile(directory, 'out.txt', 'previous');

		const result = await startJob({
			mode: 'decrypt',
			credentials: passphrase.decrypt,
			files: [file(await corrupted(randomBytes(100)), 'out.txt.age')],
			save: { kind: 'file', handle }
		}).done;

		expect(result.files[0]).toMatchObject({ status: 'failed', error: { code: 'corrupted' } });
		expect(new TextDecoder().decode(await readFile(handle))).toBe('previous');
	});
});

/** A browser with the given capabilities whose pickers must not be called unless a test says so. */
function fakeBrowser(
	capabilities: Partial<Capabilities>,
	overrides: Partial<Omit<SaveEnvironment, 'capabilities'>> = {}
): SaveEnvironment {
	return {
		capabilities: {
			browser: 'chromium',
			ios: false,
			mobile: false,
			cores: 4,
			savePicker: false,
			directoryPicker: false,
			serviceWorkerDownload: false,
			...capabilities
		},
		showSaveFilePicker: () => Promise.reject(new Error('unexpected save picker')),
		showDirectoryPicker: () => Promise.reject(new Error('unexpected folder picker')),
		...overrides
	};
}

const pickers = { savePicker: true, directoryPicker: true, serviceWorkerDownload: true };

const one = [{ name: 'a.txt' }];
const two = [{ name: 'a.txt' }, { name: 'b.txt' }];

describe('choosing a save location', () => {
	test.skipIf(!opfs)('one file asks for a file, suggesting the output name', async () => {
		const handle = await (await pickedDirectory()).getFileHandle('picked', { create: true });
		const suggested: string[] = [];

		const browser = fakeBrowser(pickers, {
			showSaveFilePicker: async (name) => {
				suggested.push(name);

				return handle;
			}
		});

		expect(await chooseSaveLocationIn(browser, 'encrypt', one)).toEqual({
			location: { kind: 'file', handle }
		});
		await chooseSaveLocationIn(browser, 'decrypt', [{ name: 'a.txt.age' }]);
		expect(suggested).toEqual(['a.txt.age', 'a.txt']);
	});

	test.skipIf(!opfs)('several files ask for a folder', async () => {
		const handle = await pickedDirectory();
		const browser = fakeBrowser(pickers, { showDirectoryPicker: async () => handle });

		expect(await chooseSaveLocationIn(browser, 'encrypt', two)).toEqual({
			location: { kind: 'directory', handle }
		});
	});

	test('without pickers, the downloads are streamed', async () => {
		const browser = fakeBrowser({ serviceWorkerDownload: true });

		expect(await chooseSaveLocationIn(browser, 'encrypt', two)).toEqual({
			location: { kind: 'sw-download' }
		});
	});

	test('without pickers or a service worker in control, saving is unsupported', async () => {
		await expect(chooseSaveLocationIn(fakeBrowser({}), 'encrypt', one)).rejects.toMatchObject({
			code: 'unsupported'
		});
	});

	test.each([
		[new DOMException('closed', 'AbortError'), 'dismissed'],
		[new DOMException('no activation', 'NotAllowedError'), 'needs-gesture'],
		[new DOMException('no activation', 'SecurityError'), 'needs-gesture']
	])('a picker failing with %s gives %s', async (error, reason) => {
		const browser = fakeBrowser(pickers, {
			showSaveFilePicker: async () => {
				throw error;
			}
		});

		expect(await chooseSaveLocationIn(browser, 'encrypt', one)).toEqual({ location: null, reason });
	});

	test('a picker that breaks for any other reason fails the save', async () => {
		const browser = fakeBrowser(pickers, {
			showSaveFilePicker: async () => {
				throw new TypeError('broken');
			}
		});

		await expect(chooseSaveLocationIn(browser, 'encrypt', one)).rejects.toMatchObject({
			code: 'save-failed'
		});
	});

	test('the picker opens before anything is awaited, inside the click', async () => {
		let opened = false;

		const browser = fakeBrowser(pickers, {
			showSaveFilePicker: () => {
				opened = true;

				return Promise.reject(new DOMException('closed', 'AbortError'));
			}
		});

		const choice = chooseSaveLocationIn(browser, 'encrypt', one);
		expect(opened).toBe(true);
		await choice;
	});
});
