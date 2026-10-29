import { Decrypter, Encrypter } from 'age-encryption';
import { describe, expect, test } from 'vitest';
import { generateKeyPair, inspectFile, startJob } from '../src/index.ts';
import { generateKeyPair as generateKeyPairInline } from '../src/keys/keys.ts';
import {
	CHUNK,
	SMALL_BATCHES,
	TEST_LOG_N,
	decrypt,
	encrypt,
	equalBytes,
	file,
	randomBytes,
	runJob
} from './helpers.ts';

const passphrase = {
	kind: 'passphrase',
	passphrase: 'correct horse battery staple',
	scryptLogN: TEST_LOG_N
} as const;

describe('round trips through the worker pipeline', () => {
	test.each([0, 1, CHUNK, 5 * CHUNK + 3, 3 * 1024 * 1024 + 17])(
		'passphrase, %i bytes',
		async (size) => {
			const plain = randomBytes(size);
			const sealed = await encrypt(plain, passphrase);
			const { snapshot, output } = await decrypt(sealed, {
				kind: 'passphrase',
				passphrase: passphrase.passphrase
			});
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

	test('default tuning and the native backend when available', async () => {
		const plain = randomBytes(9 * 1024 * 1024 + 5);
		const sealed = await encrypt(plain, passphrase, {});
		const { snapshot, output } = await decrypt(
			sealed,
			{ kind: 'passphrase', passphrase: passphrase.passphrase },
			{}
		);
		expect(equalBytes(output!, plain)).toBe(true);
		expect(snapshot.workers).toBeGreaterThanOrEqual(1);
		expect(['noble', 'webcrypto']).toContain(snapshot.backend);
	});

	test('the noble backend can be forced', async () => {
		const plain = randomBytes(CHUNK * 3);
		const sealed = await encrypt(plain, passphrase, { ...SMALL_BATCHES, backend: 'noble' });
		const { snapshot, output } = await decrypt(
			sealed,
			{ kind: 'passphrase', passphrase: passphrase.passphrase },
			{ ...SMALL_BATCHES, backend: 'noble' }
		);
		expect(snapshot.backend).toBe('noble');
		expect(equalBytes(output!, plain)).toBe(true);
	});
});

describe('compatibility with typage', () => {
	test('typage decrypts what the engine encrypts', async () => {
		const pair = await generateKeyPairInline('pq');
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
		const sealed = (await encrypter.encrypt(plain)) as Uint8Array<ArrayBuffer>;
		const { output } = await decrypt(sealed, { kind: 'passphrase', passphrase: 'hunter2' });
		expect(equalBytes(output!, plain)).toBe(true);
	});
});

describe('failures', () => {
	test('a wrong passphrase fails at the header, before the output is opened', async () => {
		const sealed = await encrypt(randomBytes(CHUNK), passphrase);
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
		const sealed = await encrypt(randomBytes(10), passphrase);
		const text = new TextDecoder().decode(sealed.subarray(0, 60));
		const logN = text.indexOf(` ${TEST_LOG_N}\n`);
		const tampered = sealed.slice();
		tampered[logN + 2] = '1'.charCodeAt(0); // logN 10 → 11
		const { snapshot } = await decrypt(tampered, {
			kind: 'passphrase',
			passphrase: passphrase.passphrase
		});
		expect(snapshot.files[0]!.error?.code).toMatch(/corrupted|wrong-credentials/);
	});

	test.each([
		['flipped payload byte', (b: Uint8Array) => ((b[b.length - 100]! ^= 1), b)],
		['truncated mid-chunk', (b: Uint8Array) => b.slice(0, b.length - 1000)],
		[
			'appended byte',
			(b: Uint8Array) => {
				const longer = new Uint8Array(b.length + 1);
				longer.set(b);
				return longer;
			}
		],
		[
			'truncated at a chunk boundary (dropped final chunk)',
			(b: Uint8Array) => b.slice(0, b.length - (CHUNK + 16))
		]
	])('%s is detected and nothing is delivered', async (_, tamper) => {
		const sealed = await encrypt(randomBytes(4 * CHUNK), passphrase);
		const { snapshot, output } = await decrypt(tamper(sealed.slice()) as Uint8Array<ArrayBuffer>, {
			kind: 'passphrase',
			passphrase: passphrase.passphrase
		});
		expect(snapshot.status).toBe('failed');
		expect(snapshot.files[0]!.error?.code).toBe('corrupted');
		expect(output).toBeNull();
	});

	test('swapped chunks are detected', async () => {
		const sealed = await encrypt(randomBytes(4 * CHUNK), passphrase);
		const payloadStart = sealed.length - 4 * (CHUNK + 16);
		const swapped = sealed.slice();
		const a = sealed.subarray(payloadStart, payloadStart + CHUNK + 16);
		const b = sealed.subarray(payloadStart + CHUNK + 16, payloadStart + 2 * (CHUNK + 16));
		swapped.set(b, payloadStart);
		swapped.set(a, payloadStart + CHUNK + 16);
		const { snapshot } = await decrypt(swapped, {
			kind: 'passphrase',
			passphrase: passphrase.passphrase
		});
		expect(snapshot.files[0]!.error?.code).toBe('corrupted');
	});

	test('legacy and plain files are rejected with their own codes', async () => {
		const legacy = new TextEncoder().encode(
			'encryptee.io' + 'x'.repeat(100)
		) as Uint8Array<ArrayBuffer>;
		expect(
			(await decrypt(legacy, { kind: 'passphrase', passphrase: 'x' })).snapshot.files[0]!.error
				?.code
		).toBe('legacy-file');
		const plain = randomBytes(100);
		plain[0] = 0;
		expect(
			(await decrypt(plain, { kind: 'passphrase', passphrase: 'x' })).snapshot.files[0]!.error?.code
		).toBe('not-encrypted');
	});

	test('an invalid public key fails the file', async () => {
		const result = await runJob({
			mode: 'encrypt',
			credentials: { kind: 'public-keys', publicKeys: ['age1notakey'] },
			files: [file(randomBytes(10))],
			save: { kind: 'memory' }
		});
		expect(result.files[0]!.error?.code).toBe('invalid-public-key');
	});
});

describe('jobs', () => {
	test('one output per input file, named .age', async () => {
		const files = [file(randomBytes(10), 'a.txt'), file(randomBytes(CHUNK + 1), 'b.pdf')];
		const result = await runJob({
			mode: 'encrypt',
			credentials: passphrase,
			files,
			save: { kind: 'memory' }
		});
		expect(result.status).toBe('done');
		expect(result.files.map((f) => f.outputName)).toEqual(['a.txt.age', 'b.pdf.age']);
		expect(result.bytesDone).toBe(result.bytesTotal);
	});

	test('a file that fails to decrypt does not stop the others', async () => {
		const good = await encrypt(randomBytes(100), passphrase);
		const result = await runJob({
			mode: 'decrypt',
			credentials: { kind: 'passphrase', passphrase: passphrase.passphrase },
			files: [file(randomBytes(100), 'junk.age'), file(good, 'good.txt.age')],
			save: { kind: 'memory' }
		});
		expect(result.status).toBe('failed');
		expect(result.files.map((f) => f.status)).toEqual(['failed', 'done']);
		expect(result.files[1]!.outputName).toBe('good.txt');
	});

	test('cancel stops the job and discards the output', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase,
			files: [{ name: 'big', size: 4 * 1024 ** 3, synthetic: true }],
			save: { kind: 'memory' },
			tuning: { workers: 1, batchChunks: 16, window: 2 }
		});
		await new Promise<void>((resolve) => {
			const stop = job.subscribe(() => {
				if (job.getSnapshot().bytesDone > 0) {
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

	test('progress snapshots are immutable and monotonic', async () => {
		const job = startJob({
			mode: 'encrypt',
			credentials: passphrase,
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
		expect(final.files[0]!.output).toEqual({
			kind: 'discarded',
			bytes: final.files[0]!.outputSize
		});
	});
});

describe('inspectFile', () => {
	test('tells passphrase files from public-key files', async () => {
		const pair = await generateKeyPair('x25519');
		const byPassphrase = await encrypt(randomBytes(10), passphrase);
		const byKey = await encrypt(randomBytes(10), {
			kind: 'public-keys',
			publicKeys: [pair.publicKey]
		});
		expect(await inspectFile(new Blob([byPassphrase]))).toEqual({
			kind: 'age',
			unlock: 'passphrase',
			recipientTypes: ['scrypt']
		});
		expect(await inspectFile(new Blob([byKey]))).toMatchObject({
			unlock: 'private-key',
			recipientTypes: ['X25519']
		});
		expect((await inspectFile(new Blob(['hello']))).kind).toBe('plain');
	});
});
