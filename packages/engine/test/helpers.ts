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

async function blobBytes(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await blob.arrayBuffer());
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;

	return true;
}

export async function runJob(options: JobOptions): Promise<JobSnapshot> {
	return startJob(options).done;
}

export async function encrypt(
	bytes: Uint8Array<ArrayBuffer>,
	credentials: EncryptCredentials,
	tuning: JobOptions['tuning'] = SMALL_BATCHES
): Promise<Uint8Array<ArrayBuffer>> {
	const result = await runJob({
		mode: 'encrypt',
		credentials,
		files: [file(bytes)],
		save: { kind: 'memory' },
		tuning
	});

	const [output] = result.files;

	if (result.status !== 'done' || output?.output?.kind !== 'memory') {
		throw new Error(`encrypt failed: ${JSON.stringify(output?.error)}`);
	}

	return blobBytes(output.output.blob);
}

export async function decrypt(
	bytes: Uint8Array<ArrayBuffer>,
	credentials: DecryptCredentials,
	tuning: JobOptions['tuning'] = SMALL_BATCHES
): Promise<{ snapshot: JobSnapshot; output: Uint8Array<ArrayBuffer> | null }> {
	const snapshot = await runJob({
		mode: 'decrypt',
		credentials,
		files: [file(bytes, 'test.bin.age')],
		save: { kind: 'memory' },
		tuning
	});

	const output = snapshot.files[0]?.output;

	return { snapshot, output: output?.kind === 'memory' ? await blobBytes(output.blob) : null };
}

export function toBase64(bytes: Uint8Array): string {
	let binary = '';

	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}

	return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
