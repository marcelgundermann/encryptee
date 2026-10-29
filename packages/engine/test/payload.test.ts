import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from 'age-encryption';
import { describe, expect, test } from 'vitest';
import { PAYLOAD_NONCE_SIZE, headerLength } from '../src/format/age.ts';
import { openBatch, sealBatch } from '../src/payload/batch.ts';
import {
	createChunkCipher,
	derivePayloadKey,
	nativeChaChaAvailable,
	type Backend
} from '../src/payload/cipher.ts';
import { batchRange, openLayout, sealLayout } from '../src/payload/layout.ts';
import { CHUNK, equalBytes, randomBytes } from './helpers.ts';

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
		payload: file.subarray(length + PAYLOAD_NONCE_SIZE)
	};
}

async function sealAll(backend: Backend, key: Uint8Array, plain: Uint8Array, batchChunks: number) {
	const cipher = await createChunkCipher(key, backend);
	const layout = sealLayout(plain.length, batchChunks);
	const parts: Uint8Array[] = [];
	for (let i = 0; i < layout.batches; i++) {
		const range = batchRange(layout, i, batchChunks);
		parts.push(await sealBatch(cipher, plain.subarray(range.start, range.end), range));
	}
	return concat(parts);
}

async function openAll(backend: Backend, key: Uint8Array, sealed: Uint8Array, batchChunks: number) {
	const cipher = await createChunkCipher(key, backend);
	const layout = openLayout(0, sealed.length, batchChunks);
	const parts: Uint8Array[] = [];
	for (let i = 0; i < layout.batches; i++) {
		const range = batchRange(layout, i, batchChunks);
		parts.push(await openBatch(cipher, sealed.subarray(range.start, range.end), range));
	}
	return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

const backends: Backend[] = (await nativeChaChaAvailable()) ? ['noble', 'webcrypto'] : ['noble'];

test('reports which payload backends this browser has', () => {
	// Chromium 155+ ships native ChaCha20-Poly1305; Firefox and WebKit don't (yet).
	expect(backends).toContain('noble');
	console.info(`payload backends: ${backends.join(', ')}`);
});

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

	test('rejects a flipped byte, swapped chunks, truncation and a dropped final chunk', async () => {
		const plain = randomBytes(3 * CHUNK + 100);
		const { key, payload } = await typageReference(plain);
		const sealedChunk = CHUNK + 16;

		const flipped = payload.slice();
		flipped[sealedChunk + 5]! ^= 1;
		await expect(openAll(backend, key, flipped, 2)).rejects.toMatchObject({ code: 'corrupted' });

		const swapped = payload.slice();
		swapped.set(payload.subarray(sealedChunk, 2 * sealedChunk), 0);
		swapped.set(payload.subarray(0, sealedChunk), sealedChunk);
		await expect(openAll(backend, key, swapped, 2)).rejects.toMatchObject({ code: 'corrupted' });

		// Truncated at a chunk boundary: the new last chunk was not sealed as final.
		const truncated = payload.slice(0, 3 * sealedChunk);
		await expect(openAll(backend, key, truncated, 2)).rejects.toMatchObject({ code: 'corrupted' });
	});

	test('rejects a dropped final chunk when the file is a whole number of chunks', async () => {
		const plain = randomBytes(4 * CHUNK);
		const { key, payload } = await typageReference(plain);
		const dropped = payload.slice(0, 3 * (CHUNK + 16));
		await expect(openAll(backend, key, dropped, 4)).rejects.toMatchObject({ code: 'corrupted' });
	});
});
