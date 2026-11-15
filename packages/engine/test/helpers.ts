import { startJob, type JobOptions, type JobSnapshot } from '../src/index.ts';
import type { DecryptCredentials, EncryptCredentials } from '../src/format/header.ts';

declare module 'vitest/browser' {
	interface BrowserCommands {
		ageAvailable: () => Promise<boolean>;
		ageKeygen: (pq: boolean) => Promise<{ privateKey: string; publicKey: string }>;
		ageEncrypt: (options: {
			input: string;
			recipients?: string[];
			passphrase?: string;
		}) => Promise<string>;
		ageDecrypt: (options: {
			input: string;
			identity?: string;
			passphrase?: string;
		}) => Promise<{ ok: true; output: string } | { ok: false; error: string }>;
	}
}

const KiB = 1024;
export const CHUNK = 64 * KiB;

/** Fast scrypt for tests; production uses logN 18. */
export const TEST_LOG_N = 10;

/** Encrypts to a passphrase with fast scrypt, and decrypts with it. */
export const passphrase = {
	encrypt: {
		kind: 'passphrase',
		passphrase: 'correct horse battery staple',
		scryptLogN: TEST_LOG_N
	},
	decrypt: { kind: 'passphrase', passphrase: 'correct horse battery staple' }
} satisfies { encrypt: EncryptCredentials; decrypt: DecryptCredentials };

/** Small batches and a small window so even little files cross batch boundaries. */
export const SMALL_BATCHES = { workers: 2, batchChunks: 2, window: 3 };

export function randomBytes(size: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(size);

	for (let offset = 0; offset < size; offset += 65536) {
		crypto.getRandomValues(bytes.subarray(offset, Math.min(size, offset + 65536)));
	}

	return bytes;
}

export function file(bytes: Uint8Array<ArrayBuffer>, name = 'test.bin'): File {
	return new File([bytes], name);
}

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;

	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}

	return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;

	return true;
}

export async function encrypt(
	bytes: Uint8Array<ArrayBuffer>,
	credentials: EncryptCredentials,
	tuning: JobOptions['tuning'] = SMALL_BATCHES
): Promise<Uint8Array<ArrayBuffer>> {
	const result = await startJob({
		mode: 'encrypt',
		credentials,
		files: [file(bytes)],
		save: { kind: 'memory' },
		tuning
	}).done;

	const [output] = result.files;

	if (result.status !== 'done' || output?.status !== 'done' || output.output.kind !== 'memory') {
		throw new Error(`encrypt failed: ${JSON.stringify(output)}`);
	}

	return output.output.blob.bytes();
}

export async function decrypt(
	bytes: Uint8Array<ArrayBuffer>,
	credentials: DecryptCredentials,
	tuning: JobOptions['tuning'] = SMALL_BATCHES
): Promise<{ snapshot: JobSnapshot; output: Uint8Array<ArrayBuffer> | null }> {
	const snapshot = await startJob({
		mode: 'decrypt',
		credentials,
		files: [file(bytes, 'test.bin.age')],
		save: { kind: 'memory' },
		tuning
	}).done;

	const [first] = snapshot.files;
	const output = first?.status === 'done' ? first.output : null;

	return { snapshot, output: output?.kind === 'memory' ? await output.blob.bytes() : null };
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
