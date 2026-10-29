import { EngineError } from '../errors.ts';
import { CHUNK_SIZE, SEALED_CHUNK_SIZE, TAG_SIZE } from '../format/age.ts';
import { writeChunkNonce, type ChunkCipher } from './cipher.ts';

/**
 * A batch is a run of consecutive age chunks handled by one crypto worker in
 * one message. `final` marks the batch holding the file's last chunk.
 */
export interface BatchPosition {
	firstChunk: number;
	final: boolean;
}

/** Seals a run of plaintext chunks. Only a final batch may end in a short (or empty) chunk. */
export async function sealBatch(
	cipher: ChunkCipher,
	plain: Uint8Array<ArrayBuffer>,
	{ firstChunk, final }: BatchPosition
): Promise<Uint8Array<ArrayBuffer>> {
	const chunks = final
		? Math.max(1, Math.ceil(plain.length / CHUNK_SIZE))
		: plain.length / CHUNK_SIZE;

	if (!Number.isInteger(chunks) || chunks === 0) {
		throw new EngineError('internal', `non-final batch of ${plain.length} bytes`);
	}

	const out = new Uint8Array(plain.length + chunks * TAG_SIZE);
	const pending: Array<void | Promise<void>> = [];

	for (let i = 0; i < chunks; i++) {
		const start = i * CHUNK_SIZE;
		const end = Math.min(start + CHUNK_SIZE, plain.length);
		const nonce = writeChunkNonce(new Uint8Array(12), firstChunk + i, final && i === chunks - 1);
		const outStart = start + i * TAG_SIZE;
		pending.push(
			cipher.seal(
				plain.subarray(start, end),
				nonce,
				out.subarray(outStart, end + (i + 1) * TAG_SIZE)
			)
		);
	}

	await Promise.all(pending);

	return out;
}

/**
 * Opens a run of sealed chunks. Any tag failure, a short non-final batch, or
 * an empty final chunk that isn't the file's only chunk throws `corrupted`.
 */
export async function openBatch(
	cipher: ChunkCipher,
	sealed: Uint8Array<ArrayBuffer>,
	{ firstChunk, final }: BatchPosition
): Promise<Uint8Array<ArrayBuffer>> {
	const chunks = Math.ceil(sealed.length / SEALED_CHUNK_SIZE);
	const rest = sealed.length % SEALED_CHUNK_SIZE;

	if (chunks === 0 || (!final && rest !== 0) || (rest !== 0 && rest < TAG_SIZE)) {
		throw new EngineError('corrupted', 'payload is truncated');
	}

	const out = new Uint8Array(sealed.length - chunks * TAG_SIZE);

	if (final && rest === TAG_SIZE && firstChunk + chunks - 1 > 0) {
		throw new EngineError('corrupted', 'final chunk is empty');
	}

	const pending: Array<void | Promise<void>> = [];

	for (let i = 0; i < chunks; i++) {
		const start = i * SEALED_CHUNK_SIZE;
		const end = Math.min(start + SEALED_CHUNK_SIZE, sealed.length);
		const nonce = writeChunkNonce(new Uint8Array(12), firstChunk + i, final && i === chunks - 1);
		const outStart = i * CHUNK_SIZE;
		pending.push(
			cipher.open(
				sealed.subarray(start, end),
				nonce,
				out.subarray(outStart, outStart + (end - start - TAG_SIZE))
			)
		);
	}

	await Promise.all(pending);

	return out;
}
