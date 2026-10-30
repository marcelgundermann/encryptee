import { describe, expect, test } from 'vite-plus/test';
import type { Capabilities } from '../src/capabilities.ts';
import { chooseSaveLocationIn, type SaveEnvironment } from '../src/sinks/save-location.ts';
import { OPFS_STAGING_DIR } from '../src/sinks/sink.ts';
import { TEST_LOG_N, decrypt, encrypt, equalBytes, file, randomBytes, runJob } from './helpers.ts';

const passphrase = {
	kind: 'passphrase',
	passphrase: 'correct horse battery staple',
	scryptLogN: TEST_LOG_N
} as const;

const unlock = { kind: 'passphrase', passphrase: passphrase.passphrase } as const;

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

async function stagingDirectory(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();

	return root.getDirectoryHandle(OPFS_STAGING_DIR, { create: true });
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
	const sealed = await encrypt(bytes, passphrase);
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

			const result = await runJob({
				mode: 'encrypt',
				credentials: passphrase,
				files: [file(randomBytes(100), 'a.txt'), file(randomBytes(100), 'b.txt')],
				save: { kind: 'sw-download' }
			});

			expect(result.status).toBe('failed');
			expect(result.files.map((f) => f.status)).toEqual(['failed', 'cancelled']);
			expect(result.files[0]!.error?.code).toBe('save-failed');
		}
	);
});

describe.skipIf(!opfs)('picked files and folders', () => {
	test('a folder gets one file per input, renamed on a collision', async () => {
		const directory = await pickedDirectory();
		await writeFile(directory, 'a.txt.age', 'keep me');
		const plain = randomBytes(100);

		const result = await runJob({
			mode: 'encrypt',
			credentials: passphrase,
			files: [file(plain, 'a.txt'), file(randomBytes(100), 'b.txt')],
			save: { kind: 'directory', handle: directory }
		});

		expect(result.status).toBe('done');
		expect(result.files.map((f) => f.output)).toEqual([{ kind: 'saved' }, { kind: 'saved' }]);
		expect(await names(directory)).toEqual(['a (1).txt.age', 'a.txt.age', 'b.txt.age']);

		const kept = await readFile(await directory.getFileHandle('a.txt.age'));
		expect(new TextDecoder().decode(kept)).toBe('keep me');

		const sealed = await readFile(await directory.getFileHandle('a (1).txt.age'));
		expect(equalBytes((await decrypt(sealed, unlock)).output!, plain)).toBe(true);
	});

	test('a corrupted file removes only the output it created in the folder', async () => {
		const directory = await pickedDirectory();
		await writeFile(directory, 'other.txt', 'not ours');

		const result = await runJob({
			mode: 'decrypt',
			credentials: unlock,
			files: [
				file(await encrypt(randomBytes(100), passphrase), 'a.txt.age'),
				file(await corrupted(randomBytes(100)), 'b.txt.age')
			],
			save: { kind: 'directory', handle: directory }
		});

		expect(result.files.map((f) => f.status)).toEqual(['done', 'failed']);
		expect(result.files[1]!.error?.code).toBe('corrupted');
		expect(await names(directory)).toEqual(['a.txt', 'other.txt']);
	});

	test('a corrupted file leaves a picked file as it was', async () => {
		const directory = await pickedDirectory();
		const handle = await writeFile(directory, 'out.txt', 'previous');

		const result = await runJob({
			mode: 'decrypt',
			credentials: unlock,
			files: [file(await corrupted(randomBytes(100)), 'out.txt.age')],
			save: { kind: 'file', handle }
		});

		expect(result.files[0]!.error?.code).toBe('corrupted');
		expect(new TextDecoder().decode(await readFile(handle))).toBe('previous');
	});
});

describe.skipIf(!opfs)('staging in OPFS', () => {
	test('a staged output is handed to the browser downloads', async () => {
		const result = await runJob({
			mode: 'encrypt',
			credentials: passphrase,
			files: [file(randomBytes(100), 'a.txt')],
			save: { kind: 'opfs' }
		});

		expect(result.status).toBe('done');
		expect(result.files[0]!.output).toEqual({ kind: 'downloaded' });
	});

	test('staging removes files left behind and keeps files still being downloaded', async () => {
		const staging = await stagingDirectory();
		const job = { mode: 'encrypt', credentials: passphrase, save: { kind: 'opfs' } } as const;

		const before = await names(staging);
		await runJob({ ...job, files: [file(randomBytes(100), 'first.txt')] });
		const first = (await names(staging)).filter((name) => !before.includes(name));
		expect(first).toHaveLength(1);

		await writeFile(staging, 'left-behind.part', 'from a closed tab');
		await runJob({ ...job, files: [file(randomBytes(100), 'second.txt')] });
		const after = await names(staging);

		expect(after).not.toContain('left-behind.part');
		expect(after).toContain(first[0]);
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
			opfs: false,
			...capabilities
		},
		showSaveFilePicker: () => Promise.reject(new Error('unexpected save picker')),
		showDirectoryPicker: () => Promise.reject(new Error('unexpected folder picker')),
		opfsOpens: () => Promise.resolve(true),
		...overrides
	};
}

const pickers = {
	savePicker: true,
	directoryPicker: true,
	serviceWorkerDownload: true,
	opfs: true
};

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

	test('without pickers, a service worker download, else OPFS staging', async () => {
		expect(
			await chooseSaveLocationIn(
				fakeBrowser({ serviceWorkerDownload: true, opfs: true }),
				'encrypt',
				one
			)
		).toEqual({ location: { kind: 'sw-download' } });
		expect(await chooseSaveLocationIn(fakeBrowser({ opfs: true }), 'encrypt', two)).toEqual({
			location: { kind: 'opfs' }
		});
	});

	test('a browser with nothing to save to, or OPFS that refuses to open, is unsupported', async () => {
		const refusing = fakeBrowser({ opfs: true }, { opfsOpens: () => Promise.resolve(false) });

		expect(await chooseSaveLocationIn(fakeBrowser({}), 'encrypt', one)).toEqual({
			location: null,
			reason: 'unsupported'
		});
		expect(await chooseSaveLocationIn(refusing, 'encrypt', one)).toEqual({
			location: null,
			reason: 'unsupported'
		});
	});

	test.each([
		[new DOMException('closed', 'AbortError'), 'dismissed'],
		[new DOMException('no activation', 'NotAllowedError'), 'needs-gesture'],
		[new DOMException('no activation', 'SecurityError'), 'needs-gesture'],
		[new TypeError('broken'), 'save-failed']
	])('a picker failing with %s gives %s', async (error, reason) => {
		const browser = fakeBrowser(pickers, {
			showSaveFilePicker: async () => {
				throw error;
			}
		});

		expect(await chooseSaveLocationIn(browser, 'encrypt', one)).toEqual({ location: null, reason });
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
