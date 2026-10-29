import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { Decrypter, Encrypter, Stanza, type Recipient } from 'age-encryption';
import { EngineError } from '../errors.ts';
import { PAYLOAD_NONCE_SIZE, TAG_SIZE, headerLength } from './age.ts';

/** age's default and the plan's choice (D3): about one second on a laptop. */
export const DEFAULT_SCRYPT_LOG_N = 18;

export type EncryptCredentials =
	| { kind: 'passphrase'; passphrase: string; scryptLogN?: number }
	| { kind: 'public-keys'; publicKeys: string[] };

export type DecryptCredentials =
	| { kind: 'passphrase'; passphrase: string }
	| { kind: 'private-keys'; privateKeys: string[] };

export interface SealedHeader {
	/** The full header, through the newline after the MAC. */
	header: Uint8Array;
	fileKey: Uint8Array;
}

/**
 * Builds an age header for a fresh random file key.
 *
 * typage 0.3.1 does not export its recipient classes or header encoder, so we
 * use its `Encrypter` as the header builder: a stanza-less recipient captures
 * the file key, we encrypt an empty payload, and cut the 32 trailing payload
 * bytes (16-byte nonce + one empty sealed chunk) off the result. See ADR 0002.
 */
export async function sealHeader(credentials: EncryptCredentials): Promise<SealedHeader> {
	const capture = new FileKeyCapture();
	const encrypter = new Encrypter();

	if (credentials.kind === 'passphrase') {
		encrypter.addRecipient(
			new ScryptRecipient(credentials.passphrase, credentials.scryptLogN ?? DEFAULT_SCRYPT_LOG_N)
		);
	} else {
		if (credentials.publicKeys.length === 0) {
			throw new EngineError('invalid-public-key', 'at least one public key is required');
		}

		for (const publicKey of credentials.publicKeys) addPublicKey(encrypter, publicKey);
	}

	encrypter.addRecipient(capture);

	const file = await encrypter.encrypt(new Uint8Array(0));
	const header = file.slice(0, file.length - PAYLOAD_NONCE_SIZE - TAG_SIZE);

	if (capture.fileKey === null || headerLength(header) !== header.length) {
		throw new EngineError('internal', 'typage produced an unexpected file layout');
	}

	return { header, fileKey: capture.fileKey };
}

/**
 * Recovers the file key from a header, verifying the header MAC. Fails with
 * `wrong-credentials` before any payload byte is touched.
 */
export async function openHeader(
	header: Uint8Array,
	credentials: DecryptCredentials
): Promise<Uint8Array> {
	const decrypter = new Decrypter();

	if (credentials.kind === 'passphrase') {
		decrypter.addPassphrase(credentials.passphrase);
	} else {
		for (const privateKey of credentials.privateKeys) {
			try {
				decrypter.addIdentity(privateKey);
			} catch (cause) {
				throw new EngineError('invalid-key-file', 'unrecognized private key', { cause });
			}
		}
	}

	try {
		return await decrypter.decryptHeader(header);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);

		if (message.includes('no identity matched')) {
			throw new EngineError('wrong-credentials', message, { cause });
		}

		throw new EngineError('corrupted', `invalid header: ${message}`, { cause });
	}
}

/** Throws `invalid-public-key` unless `publicKey` is a recipient typage can encrypt to. */
export function assertPublicKey(publicKey: string): void {
	addPublicKey(new Encrypter(), publicKey);
}

function addPublicKey(encrypter: Encrypter, publicKey: string): void {
	try {
		encrypter.addRecipient(publicKey.trim());
	} catch (cause) {
		throw new EngineError('invalid-public-key', `invalid public key: ${publicKey}`, { cause });
	}
}

class FileKeyCapture implements Recipient {
	fileKey: Uint8Array | null = null;

	wrapFileKey(fileKey: Uint8Array): Stanza[] {
		this.fileKey = fileKey.slice();

		return [];
	}
}

const SCRYPT_LABEL = new TextEncoder().encode('age-encryption.org/v1/scrypt');

/**
 * The age scrypt recipient, byte-compatible with typage's (which isn't
 * exported). Uses `scryptAsync` so the worker stays responsive to cancel.
 */
class ScryptRecipient implements Recipient {
	constructor(
		private readonly passphrase: string,
		private readonly logN: number
	) {}

	async wrapFileKey(fileKey: Uint8Array): Promise<Stanza[]> {
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const labelAndSalt = new Uint8Array(SCRYPT_LABEL.length + salt.length);
		labelAndSalt.set(SCRYPT_LABEL);
		labelAndSalt.set(salt, SCRYPT_LABEL.length);

		const key = await scryptAsync(this.passphrase, labelAndSalt, {
			N: 2 ** this.logN,
			r: 8,
			p: 1,
			dkLen: 32
		});

		const body = chacha20poly1305(key, new Uint8Array(12)).encrypt(fileKey);
		key.fill(0);

		return [new Stanza(['scrypt', base64NoPad(salt), String(this.logN)], body)];
	}
}

function base64NoPad(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
}
