import { Decrypter, Encrypter } from 'age-encryption';
import { describe, expect, test } from 'vite-plus/test';
import { server } from 'vite-plus/test/browser';
import {
	checkCredentials,
	generateKeyPair,
	inspectFile,
	startJob,
	type JobOptions
} from '../src/index.ts';
import { SEALED_CHUNK_SIZE } from '../src/format/age.ts';
import { nativeChaChaAvailable } from '../src/payload/cipher.ts';
import {
	CHUNK,
	SMALL_BATCHES,
	TEST_LOG_N,
	decrypt,
	encrypt,
	equalBytes,
	file,
	passphrase,
	randomBytes
} from './helpers.ts';

describe('round trips through the worker pipeline', () => {
	test.each([0, 1, CHUNK, 5 * CHUNK + 3, 3 * 1024 * 1024 + 17])(
		'passphrase, %i bytes',
		async (size) => {
			const plain = randomBytes(size);
			const sealed = await encrypt(plain, passphrase.encrypt);

			const { snapshot, output } = await decrypt(sealed, passphrase.decrypt);

			expect(snapshot.status).toBe('done');
			expect(equalBytes(output!, plain)).toBe(true);
		}
	);

	test('several public keys, opened by each private key', async () => {
		const pq = await generateKeyPair('pq');
		const classic = await generateKeyPair('x25519');
		const plain = randomBytes(2 * CHUNK + 9);

		const sealed = await encrypt(plain, {
			kind: 'public-keys',
			publicKeys: [pq.publicKey, classic.publicKey]
		});

		for (const pair of [pq, classic]) {
			const { output } = await decrypt(sealed, {
				kind: 'private-keys',
				privateKeys: [pair.privateKey]
			});

			expect(equalBytes(output!, plain)).toBe(true);
		}
	});

	test('default tuning uses the native backend where the browser has one', async () => {
		const plain = randomBytes(9 * 1024 * 1024 + 5);
		const sealed = await encrypt(plain, passphrase.encrypt, {});

		const { snapshot, output } = await decrypt(sealed, passphrase.decrypt, {});

		expect(equalBytes(output!, plain)).toBe(true);
		expect(snapshot.backend).toBe((await nativeChaChaAvailable()) ? 'webcrypto' : 'noble');
	});

	test('the noble backend can be forced', async () => {
		const plain = randomBytes(CHUNK * 3);
		const sealed = await encrypt(plain, passphrase.encrypt, { ...SMALL_BATCHES, backend: 'noble' });

		const { snapshot, output } = await decrypt(sealed, passphrase.decrypt, {
			...SMALL_BATCHES,
			backend: 'noble'
		});

		expect(snapshot.backend).toBe('noble');
		expect(equalBytes(output!, plain)).toBe(true);
	});

	test.runIf(server.browser === 'chromium')(
		'Chromium has native ChaCha20-Poly1305, so the webcrypto backend gets tested',
		async () => {
			expect(await nativeChaChaAvailable()).toBe(true);
		}
	);
});

describe('compatibility with typage', () => {
	test('typage decrypts what the engine encrypts', async () => {
		const pair = await generateKeyPair('pq');
		const plain = randomBytes(4 * CHUNK + 1);
		const sealed = await encrypt(plain, { kind: 'public-keys', publicKeys: [pair.publicKey] });
		const decrypter = new Decrypter();
		decrypter.addIdentity(pair.privateKey);
		expect(equalBytes(await decrypter.decrypt(sealed), plain)).toBe(true);
	});

	test('the engine decrypts what typage encrypts', async () => {
		const plain = randomBytes(6 * CHUNK);
		const encrypter = new Encrypter();
		encrypter.setScryptWorkFactor(TEST_LOG_N);
		encrypter.setPassphrase('hunter2');
		const sealed = new Uint8Array(await encrypter.encrypt(plain));
		const { output } = await decrypt(sealed, { kind: 'passphrase', passphrase: 'hunter2' });
		expect(equalBytes(output!, plain)).toBe(true);
	});
});

describe('failures', () => {
	test('a wrong passphrase fails at the header, before the output is opened', async () => {
		const sealed = await encrypt(randomBytes(CHUNK), passphrase.encrypt);
		const { snapshot, output } = await decrypt(sealed, { kind: 'passphrase', passphrase: 'wrong' });
		expect(snapshot.status).toBe('failed');
		expect(snapshot.files[0]!.error?.code).toBe('wrong-credentials');
		expect(snapshot.files[0]!.outputSize).toBeNull();
		expect(output).toBeNull();
	});

	test('a wrong private key fails at the header', async () => {
		const [right, wrong] = await Promise.all([generateKeyPair(), generateKeyPair()]);

		const sealed = await encrypt(randomBytes(10), {
			kind: 'public-keys',
			publicKeys: [right.publicKey]
		});

		const { snapshot } = await decrypt(sealed, {
			kind: 'private-keys',
			privateKeys: [wrong.privateKey]
		});

		expect(snapshot.files[0]!.error?.code).toBe('wrong-credentials');
		expect(snapshot.files[0]!.outputSize).toBeNull();
	});

	test('a modified header fails the MAC check', async () => {
		const sealed = await encrypt(randomBytes(10), passphrase.encrypt);
		// The MAC's first base64 character, swapped for another valid one.
		const mac = new TextDecoder().decode(sealed.subarray(0, 200)).indexOf('\n--- ') + 5;
		const tampered = sealed.slice();
		tampered[mac] = tampered[mac] === 0x41 ? 0x42 : 0x41;

		const { snapshot } = await decrypt(tampered, passphrase.decrypt);

		expect(snapshot.files[0]!.error?.code).toBe('corrupted');
		expect(snapshot.files[0]!.outputSize).toBeNull();
	});

	test.each([
		['flipped payload byte', (b: Uint8Array<ArrayBuffer>) => ((b[b.length - 100]! ^= 1), b)],
		['truncated mid-chunk', (b: Uint8Array<ArrayBuffer>) => b.slice(0, b.length - 1000)],
		[
			'appended byte',
			(b: Uint8Array<ArrayBuffer>) => {
				const longer = new Uint8Array(b.length + 1);
				longer.set(b);

				return longer;
			}
		],
		[
			'truncated at a chunk boundary (dropped final chunk)',
			(b: Uint8Array<ArrayBuffer>) => b.slice(0, b.length - SEALED_CHUNK_SIZE)
		],
		[
			'swapped chunks',
			(b: Uint8Array<ArrayBuffer>) => {
				const first = b.length - 4 * SEALED_CHUNK_SIZE;
				const second = first + SEALED_CHUNK_SIZE;
				const swapped = b.slice();
				swapped.set(b.subarray(second, second + SEALED_CHUNK_SIZE), first);
				swapped.set(b.subarray(first, second), second);

				return swapped;
			}
		]
	])('%s is detected and nothing is delivered', async (_, tamper) => {
		const sealed = await encrypt(randomBytes(4 * CHUNK), passphrase.encrypt);

		const { snapshot, output } = await decrypt(tamper(sealed.slice()), passphrase.decrypt);

		expect(snapshot.status).toBe('failed');
		expect(snapshot.files[0]!.error?.code).toBe('corrupted');
		expect(output).toBeNull();
	});

	test.each([
		['an Encryptee v1 file', 'legacy-file', 'encryptee.io' + 'x'.repeat(100)],
		['an armored age file', 'armored', '-----BEGIN AGE ENCRYPTED FILE-----\nYWdl\n'],
		['a plaintext file', 'not-encrypted', '\0' + 'x'.repeat(99)]
	])('%s is refused as %s', async (_, code, contents) => {
		const { snapshot } = await decrypt(new TextEncoder().encode(contents), passphrase.decrypt);

		expect(snapshot.files[0]!.error?.code).toBe(code);
	});

	test('an invalid public key fails the file', async () => {
		const result = await startJob({
			mode: 'encrypt',
			credentials: { kind: 'public-keys', publicKeys: ['age1notakey'] },
			files: [file(randomBytes(10))],
			save: { kind: 'memory' }
		}).done;

		expect(result.files[0]!.error?.code).toBe('invalid-public-key');
	});
});

describe('jobs', () => {
	test('one output per input file, named .age', async () => {
		const files = [file(randomBytes(10), 'a.txt'), file(randomBytes(CHUNK + 1), 'b.pdf')];

		const result = await startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files,
			save: { kind: 'memory' }
		}).done;

		expect(result.status).toBe('done');
		expect(result.files.map((f) => f.outputName)).toEqual(['a.txt.age', 'b.pdf.age']);
		expect(result.bytesDone).toBe(result.bytesTotal);
	});

	test('a file that fails to decrypt does not stop the others', async () => {
		const good = await encrypt(randomBytes(100), passphrase.encrypt);

		const result = await startJob({
			mode: 'decrypt',
			credentials: passphrase.decrypt,
			files: [file(randomBytes(100), 'junk.age'), file(good, 'good.txt.age')],
			save: { kind: 'memory' }
		}).done;

		expect(result.status).toBe('failed');
		expect(result.files.map((f) => f.status)).toEqual(['failed', 'done']);
		expect(result.files[1]!.outputName).toBe('good.txt');
	});

	test('cancel stops the job and discards the output', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [{ name: 'big', size: 4 * 1024 ** 3, synthetic: true }],
			save: { kind: 'discard' },
			tuning: { workers: 1, batchChunks: 16, window: 2 }
		});

		await new Promise<void>((resolve) => {
			const stop = job.subscribe(() => {
				const { bytesDone, status } = job.getSnapshot();

				if (bytesDone > 0 || status !== 'running') {
					stop();
					resolve();
				}
			});
		});
		job.cancel();
		const result = await job.done;
		expect(result.status).toBe('cancelled');
		expect(result.files[0]!.status).toBe('cancelled');
		expect(result.files[0]!.output).toBeNull();
	});

	test('a cancel just after a file finishes cancels the files after it', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [file(randomBytes(10), 'a.txt'), file(randomBytes(10), 'b.txt')],
			save: { kind: 'memory' },
			tuning: SMALL_BATCHES
		});

		const stop = job.subscribe(() => {
			if (job.getSnapshot().files[0]!.status !== 'done') return;
			stop();
			job.cancel();
		});

		const result = await job.done;
		expect(result.status).toBe('cancelled');
		expect(result.files.map((f) => f.status)).toEqual(['done', 'cancelled']);
	});

	test('a cancel after every file is saved leaves the job done', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [file(randomBytes(10), 'a.txt')],
			save: { kind: 'memory' },
			tuning: SMALL_BATCHES
		});

		const stop = job.subscribe(() => {
			if (job.getSnapshot().files[0]!.status !== 'done') return;
			stop();
			job.cancel();
		});

		expect((await job.done).status).toBe('done');
	});

	test('a cancel while the output opens cancels the file before it runs', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [file(randomBytes(10), 'a.txt'), file(randomBytes(10), 'b.txt')],
			save: { kind: 'memory' },
			tuning: SMALL_BATCHES
		});

		const stop = job.subscribe(() => {
			if (job.getSnapshot().files[0]!.status !== 'running') return;
			stop();
			job.cancel();
		});

		const result = await job.done;
		expect(result.status).toBe('cancelled');
		expect(result.files.map((f) => [f.status, f.output])).toEqual([
			['cancelled', null],
			['cancelled', null]
		]);
	});

	test('a cancel while scrypt seals the header never opens the output', async () => {
		const job = startJob({
			mode: 'encrypt',
			// Production's work factor, so the cancel arrives while scrypt runs.
			credentials: { ...passphrase.encrypt, scryptLogN: 18 },
			files: [file(randomBytes(10), 'a.txt')],
			save: { kind: 'memory' }
		});

		// A running file reaches the coordinator before this turn ends; the cancel comes after it.
		const stop = job.subscribe(() => {
			if (job.getSnapshot().files[0]!.status !== 'running') return;
			stop();
			setTimeout(job.cancel);
		});

		const result = await job.done;
		expect(result.status).toBe('cancelled');
		expect(result.files[0]!.outputSize).toBeNull();
	});

	test.runIf(globalThis.gc)('a job that ended no longer holds its credentials', async () => {
		const { job, credentials } = startWatchedJob();
		await job.done;
		// Until the task that ended the job is over, the browser holds the handler it ran.
		await new Promise((resolve) => setTimeout(resolve));
		globalThis.gc!();
		expect(credentials.deref()).toBeUndefined();
		// Held through the collection, like the app holds a finished job on its screen.
		expect(job.getSnapshot().status).toBe('done');
	});

	test('every change is a new snapshot, and progress only grows', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase.encrypt,
			files: [{ name: 'synthetic', size: 64 * 1024 * 1024, synthetic: true }],
			save: { kind: 'discard' }
		});

		const seen = [job.getSnapshot()];
		job.subscribe(() => seen.push(job.getSnapshot()));
		const final = await job.done;
		expect(final.status).toBe('done');
		expect(new Set(seen).size).toBe(seen.length);
		const done = seen.map((s) => s.bytesDone);
		expect(done).toEqual(done.toSorted((a, b) => a - b));
	});

	// The service worker sends the announced size as the download's Content-Length.
	test.each(['encrypt', 'decrypt'] as const)(
		'%s: the output size announced when the output opens is the bytes the job writes',
		async (mode) => {
			const plain = randomBytes(3 * CHUNK + 5);
			const save = { kind: 'discard' } as const;

			const options: JobOptions =
				mode === 'encrypt'
					? { mode, credentials: passphrase.encrypt, files: [file(plain)], save }
					: {
							mode,
							credentials: passphrase.decrypt,
							files: [file(await encrypt(plain, passphrase.encrypt))],
							save
						};

			const [written] = (await startJob({ ...options, tuning: SMALL_BATCHES }).done).files;
			expect(written!.output).toEqual({ kind: 'discarded', bytes: written!.outputSize });
		}
	);
});

describe('inspectFile', () => {
	test.each([
		[
			'a file encrypted with a passphrase',
			() => encrypt(randomBytes(10), passphrase.encrypt),
			{ kind: 'encrypted', unlock: 'passphrase' }
		],
		[
			'a file encrypted to a public key',
			async () => {
				const { publicKey } = await generateKeyPair('x25519');

				return encrypt(randomBytes(10), { kind: 'public-keys', publicKeys: [publicKey] });
			},
			{ kind: 'encrypted', unlock: 'private-key' }
		],
		['a plaintext file', async () => new TextEncoder().encode('hello'), { kind: 'plaintext' }]
	])('%s is %j', async (_, contents, info) => {
		expect(await inspectFile(new Blob([await contents()]))).toEqual(info);
	});
});

describe('checkCredentials', () => {
	test('a wrong passphrase is refused', async () => {
		const files = [file(await encrypt(randomBytes(CHUNK), passphrase.encrypt), 'test.bin.age')];

		await expect(
			checkCredentials({ files, credentials: { kind: 'passphrase', passphrase: 'wrong' } })
		).rejects.toMatchObject({ code: 'wrong-credentials' });
	});

	test('a plaintext file is refused as not encrypted', async () => {
		const files = [file(new TextEncoder().encode('plain text'))];

		await expect(
			checkCredentials({ files, credentials: passphrase.decrypt })
		).rejects.toMatchObject({ code: 'not-encrypted' });
	});

	test('a checked job decrypts every file', async () => {
		const plain = [randomBytes(3 * CHUNK + 1), randomBytes(CHUNK - 7)];

		const files = await Promise.all(
			plain.map(async (bytes, i) => file(await encrypt(bytes, passphrase.encrypt), `${i}.bin.age`))
		);

		const checked = await checkCredentials({
			files,
			credentials: passphrase.decrypt,
			tuning: SMALL_BATCHES
		});

		const snapshot = await checked.startJob({ kind: 'memory' }).done;

		expect(snapshot.status).toBe('done');

		for (const [i, { output }] of snapshot.files.entries()) {
			expect(output?.kind === 'memory' && equalBytes(await output.blob.bytes(), plain[i]!)).toBe(
				true
			);
		}
	});
});

/**
 * Starts a job with credentials nothing else holds, and a weak reference
 * that says whether they're still reachable.
 */
function startWatchedJob() {
	const credentials = { ...passphrase.encrypt };

	const job = startJob({
		mode: 'encrypt',
		credentials,
		files: [file(randomBytes(10), 'a.txt')],
		save: { kind: 'memory' }
	});

	return { job, credentials: new WeakRef(credentials) };
}
