import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { EngineError } from '../errors.ts';
import { TAG_SIZE } from '../format/age.ts';

export type Backend = 'webcrypto' | 'noble';

const PAYLOAD_LABEL = new TextEncoder().encode('payload');

/** `HKDF-SHA-256(fileKey, salt = payload nonce, "payload")`, per the age spec. */
export function derivePayloadKey(fileKey: Uint8Array, payloadNonce: Uint8Array): Uint8Array {
	return hkdf(sha256, fileKey, payloadNonce, PAYLOAD_LABEL, 32);
}

/** Writes the 12-byte STREAM nonce for chunk `index`: `BE88(index) ‖ lastFlag`. */
export function writeChunkNonce(nonce: Uint8Array, index: number, last: boolean): Uint8Array {
	const view = new DataView(nonce.buffer, nonce.byteOffset, 12);
	view.setUint8(0, 0);
	view.setUint16(1, 0);
	view.setUint32(3, Math.floor(index / 2 ** 32));
	view.setUint32(7, index >>> 0);
	view.setUint8(11, last ? 1 : 0);

	return nonce;
}

/** Seals and opens single 64 KiB age chunks with one payload key. */
export interface ChunkCipher {
	readonly backend: Backend;
	/** Seals `plain` into `out`, which must be exactly `plain.length + 16` bytes. */
	seal(plain: Uint8Array, nonce: Uint8Array, out: Uint8Array): void | Promise<void>;
	/** Opens `sealed` into `out` (exactly `sealed.length - 16` bytes); throws `corrupted` on a bad tag. */
	open(sealed: Uint8Array, nonce: Uint8Array, out: Uint8Array): void | Promise<void>;
}

export async function createChunkCipher(key: Uint8Array, prefer?: Backend): Promise<ChunkCipher> {
	if (prefer !== 'noble' && (await nativeChaChaAvailable())) {
		return WebCryptoChunkCipher.create(key);
	}

	if (prefer === 'webcrypto') {
		throw new EngineError('unsupported', 'native ChaCha20-Poly1305 is not available');
	}

	return new NobleChunkCipher(key);
}

class NobleChunkCipher implements ChunkCipher {
	readonly backend = 'noble';
	private readonly key: Uint8Array;

	constructor(key: Uint8Array) {
		this.key = key.slice();
	}

	seal(plain: Uint8Array, nonce: Uint8Array, out: Uint8Array): void {
		chacha20poly1305(this.key, nonce).encrypt(plain, out);
	}

	open(sealed: Uint8Array, nonce: Uint8Array, out: Uint8Array): void {
		try {
			chacha20poly1305(this.key, nonce).decrypt(sealed, out);
		} catch (cause) {
			throw new EngineError('corrupted', 'chunk authentication failed', { cause });
		}
	}
}

const ALGORITHM = 'ChaCha20-Poly1305';

class WebCryptoChunkCipher implements ChunkCipher {
	readonly backend = 'webcrypto';

	private constructor(private readonly key: CryptoKey) {}

	static async create(rawKey: Uint8Array): Promise<WebCryptoChunkCipher> {
		return new WebCryptoChunkCipher(await importChaChaKey(rawKey));
	}

	async seal(plain: Uint8Array, nonce: Uint8Array, out: Uint8Array): Promise<void> {
		const sealed = await crypto.subtle.encrypt(
			{ name: ALGORITHM, iv: nonce as Uint8Array<ArrayBuffer> },
			this.key,
			plain as Uint8Array<ArrayBuffer>
		);

		out.set(new Uint8Array(sealed));
	}

	async open(sealed: Uint8Array, nonce: Uint8Array, out: Uint8Array): Promise<void> {
		let plain: ArrayBuffer;

		try {
			plain = await crypto.subtle.decrypt(
				{ name: ALGORITHM, iv: nonce as Uint8Array<ArrayBuffer> },
				this.key,
				sealed as Uint8Array<ArrayBuffer>
			);
		} catch (cause) {
			throw new EngineError('corrupted', 'chunk authentication failed', { cause });
		}

		out.set(new Uint8Array(plain));
	}
}

async function importChaChaKey(rawKey: Uint8Array): Promise<CryptoKey> {
	const key = rawKey as Uint8Array<ArrayBuffer>;

	// The modern-algorithms draft imports symmetric keys as `raw-secret`; older
	// builds only knew `raw`.
	try {
		return await crypto.subtle.importKey('raw-secret' as 'raw', key, ALGORITHM, false, [
			'encrypt',
			'decrypt'
		]);
	} catch {
		return await crypto.subtle.importKey('raw', key, ALGORITHM, false, ['encrypt', 'decrypt']);
	}
}

let nativeProbe: Promise<boolean> | undefined;

/**
 * Whether this context has a working native ChaCha20-Poly1305 (Chrome 155+).
 * Detection is by round-tripping a known vector against noble, which also
 * guards against a broken implementation.
 */
export function nativeChaChaAvailable(): Promise<boolean> {
	nativeProbe ??= probeNative();

	return nativeProbe;
}

async function probeNative(): Promise<boolean> {
	if (typeof crypto === 'undefined' || !crypto.subtle) return false;

	try {
		const key = new Uint8Array(32).map((_, i) => i);
		const nonce = writeChunkNonce(new Uint8Array(12), 7, true);
		const plain = new Uint8Array(1000).map((_, i) => i * 31);
		const native = await WebCryptoChunkCipher.create(key);
		const fromNative = new Uint8Array(plain.length + TAG_SIZE);
		await native.seal(plain, nonce, fromNative);
		const fromNoble = new Uint8Array(plain.length + TAG_SIZE);
		new NobleChunkCipher(key).seal(plain, nonce, fromNoble);

		return fromNative.every((byte, i) => byte === fromNoble[i]);
	} catch {
		return false;
	}
}
