import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from 'age-encryption';
import { describe, expect, test } from 'vite-plus/test';
import { PAYLOAD_NONCE_SIZE, SEALED_CHUNK_SIZE, headerLength } from '../src/format/age.ts';
import { openBatch, sealBatch } from '../src/payload/batch.ts';
import {
	createChunkCipher,
	derivePayloadKey,
	nativeChaChaAvailable,
	type Backend
} from '../src/payload/cipher.ts';
import { batchRange, openLayout, sealLayout } from '../src/payload/layout.ts';
import { CHUNK, concat, equalBytes, randomBytes } from './helpers.ts';

const SIZES = [
	0,
	1,
	CHUNK - 1,
	CHUNK,
	CHUNK + 1,
	3 * CHUNK - 1,
	3 * CHUNK,
	3 * CHUNK + 1,
	9 * CHUNK + 7
];

const BATCH_CHUNKS = [1, 2, 4];

/** Encrypts with typage and recovers the file key, so our engine can re-seal with the same key and nonce. */
async function typageReference(plain: Uint8Array) {
	const identity = await generateX25519Identity();
	const encrypter = new Encrypter();
	encrypter.addRecipient(await identityToRecipient(identity));
	const file = await encrypter.encrypt(plain);
	const length = headerLength(file)!;
	const decrypter = new Decrypter();
	decrypter.addIdentity(identity);
	const fileKey = await decrypter.decryptHeader(file.subarray(0, length));
	const nonce = file.slice(length, length + PAYLOAD_NONCE_SIZE);

	return {
		key: derivePayloadKey(fileKey, nonce),
		payload: file.slice(length + PAYLOAD_NONCE_SIZE)
	};
}

async function sealAll(
	backend: Backend,
	key: Uint8Array<ArrayBuffer>,
	plain: Uint8Array<ArrayBuffer>,
	batchChunks: number
) {
	const cipher = await createChunkCipher(key, backend);
	const layout = sealLayout(plain.length, batchChunks);
	const parts: Uint8Array[] = [];

	for (let i = 0; i < layout.batches; i++) {
		const range = batchRange(layout, i);
		parts.push(await sealBatch(cipher, plain.subarray(range.start, range.end), range));
	}

	return concat(parts);
}

async function openAll(
	backend: Backend,
	key: Uint8Array<ArrayBuffer>,
	sealed: Uint8Array<ArrayBuffer>,
	batchChunks: number
) {
	const cipher = await createChunkCipher(key, backend);
	const layout = openLayout(0, sealed.length, batchChunks);
	const parts: Uint8Array[] = [];

	for (let i = 0; i < layout.batches; i++) {
		const range = batchRange(layout, i);
		parts.push(await openBatch(cipher, sealed.subarray(range.start, range.end), range));
	}

	return concat(parts);
}

const backends: Backend[] = (await nativeChaChaAvailable()) ? ['noble', 'webcrypto'] : ['noble'];

describe.each(backends)('%s backend', (backend) => {
	test.each(SIZES)('payload is byte-identical to typage for %i bytes', async (size) => {
		const plain = randomBytes(size);
		const { key, payload } = await typageReference(plain);

		for (const batchChunks of BATCH_CHUNKS) {
			const ours = await sealAll(backend, key, plain, batchChunks);
			expect(equalBytes(ours, payload), `batchChunks=${batchChunks}`).toBe(true);
			expect(equalBytes(await openAll(backend, key, payload, batchChunks), plain)).toBe(true);
		}
	});

	test.each([
		[
			'a flipped byte',
			(payload: Uint8Array<ArrayBuffer>) => {
				const flipped = payload.slice();
				flipped[SEALED_CHUNK_SIZE + 5]! ^= 1;

				return flipped;
			}
		],
		[
			'swapped chunks',
			(payload: Uint8Array<ArrayBuffer>) => {
				const swapped = payload.slice();
				swapped.set(payload.subarray(SEALED_CHUNK_SIZE, 2 * SEALED_CHUNK_SIZE), 0);
				swapped.set(payload.subarray(0, SEALED_CHUNK_SIZE), SEALED_CHUNK_SIZE);

				return swapped;
			}
		],
		// The new last chunk was not sealed as final.
		[
			'a dropped final chunk',
			(payload: Uint8Array<ArrayBuffer>) => payload.slice(0, 3 * SEALED_CHUNK_SIZE)
		]
	])('rejects %s as corrupted', async (_, tamper) => {
		const plain = randomBytes(3 * CHUNK + 100);
		const { key, payload } = await typageReference(plain);

		await expect(openAll(backend, key, tamper(payload), 2)).rejects.toMatchObject({
			code: 'corrupted'
		});
	});

	test('rejects a dropped final chunk when the file is a whole number of chunks', async () => {
		const plain = randomBytes(4 * CHUNK);
		const { key, payload } = await typageReference(plain);
		const dropped = payload.slice(0, 3 * SEALED_CHUNK_SIZE);
		await expect(openAll(backend, key, dropped, 4)).rejects.toMatchObject({ code: 'corrupted' });
	});
});
