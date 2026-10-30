import { EngineError } from '../errors.ts';

/** Plaintext bytes per age payload chunk, fixed by the spec. */
export const CHUNK_SIZE = 64 * 1024;

/** ChaCha20-Poly1305 tag size. */
export const TAG_SIZE = 16;
export const SEALED_CHUNK_SIZE = CHUNK_SIZE + TAG_SIZE;

/** The random payload nonce between header and payload (the HKDF salt). */
export const PAYLOAD_NONCE_SIZE = 16;

/** age 1.3.2 rejects larger headers, so we never read further than this. */
export const MAX_HEADER_SIZE = 2 * 1024 * 1024;

const encoder = new TextEncoder();
const AGE_MAGIC = encoder.encode('age-encryption.org/v1\n');
const ARMOR_MAGIC = encoder.encode('-----BEGIN AGE ENCRYPTED FILE-----');
const LEGACY_MAGIC = encoder.encode('encryptee.io');
const MAC_LINE_START = encoder.encode('\n--- ');
const NEWLINE = 0x0a;

export type FileKind = 'age' | 'age-armored' | 'legacy' | 'plain';

/** Classifies a file by its first bytes. The extension is never consulted. */
export function sniffBytes(head: Uint8Array): FileKind {
	if (startsWith(head, AGE_MAGIC)) return 'age';

	if (startsWith(head, ARMOR_MAGIC)) return 'age-armored';

	if (startsWith(head, LEGACY_MAGIC)) return 'legacy';

	return 'plain';
}

/** Number of payload chunks for a plaintext. An empty file still has one (empty, final) chunk. */
function chunkCount(plaintextSize: number): number {
	return Math.max(1, Math.ceil(plaintextSize / CHUNK_SIZE));
}

/** Size of the sealed payload (without header and nonce) for a plaintext size. */
export function sealedPayloadSize(plaintextSize: number): number {
	return plaintextSize + TAG_SIZE * chunkCount(plaintextSize);
}

/**
 * Size of the plaintext for a sealed payload size. Throws `corrupted` for sizes
 * no valid age payload can have (e.g. a truncated tag or an empty final chunk).
 */
export function openedPayloadSize(sealedSize: number): number {
	if (sealedSize < TAG_SIZE) throw new EngineError('corrupted', 'payload is too short');

	if (sealedSize === TAG_SIZE) return 0;
	const fullChunks = Math.floor(sealedSize / SEALED_CHUNK_SIZE);
	const rest = sealedSize % SEALED_CHUNK_SIZE;

	if (rest > 0 && rest <= TAG_SIZE) throw new EngineError('corrupted', 'payload size is invalid');

	return sealedSize - TAG_SIZE * (fullChunks + (rest > 0 ? 1 : 0));
}

/**
 * Returns the length of the age header (through the newline after the MAC) at
 * the start of `bytes`, or `null` if the header doesn't end within `bytes`.
 */
export function headerLength(bytes: Uint8Array): number | null {
	const mac = indexOf(bytes, MAC_LINE_START, AGE_MAGIC.length - 1);

	if (mac === -1) return null;
	const end = bytes.indexOf(NEWLINE, mac + MAC_LINE_START.length);

	return end === -1 ? null : end + 1;
}

/** The recipient types named in a header, e.g. `scrypt`, `X25519`, `mlkem768x25519`. */
export function stanzaTypes(header: Uint8Array): string[] {
	const text = new TextDecoder().decode(header);
	const types: string[] = [];

	for (const line of text.split('\n')) {
		if (line.startsWith('-> ')) types.push(line.slice(3).split(' ')[0] ?? '');
	}

	return types;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
	if (bytes.length < prefix.length) return false;

	for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;

	return true;
}

function indexOf(bytes: Uint8Array, needle: Uint8Array, from: number): number {
	const first = needle[0];

	for (let i = bytes.indexOf(first!, from); i !== -1; i = bytes.indexOf(first!, i + 1)) {
		if (i + needle.length > bytes.length) return -1;
		let match = true;

		for (let j = 1; j < needle.length; j++) {
			if (bytes[i + j] !== needle[j]) {
				match = false;
				break;
			}
		}

		if (match) return i;
	}

	return -1;
}
