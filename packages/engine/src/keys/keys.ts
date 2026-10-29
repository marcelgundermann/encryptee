import {
	Decrypter,
	Encrypter,
	generateHybridIdentity,
	generateX25519Identity,
	identityToRecipient
} from 'age-encryption';
import { EngineError } from '../errors.ts';
import { sniffBytes } from '../format/age.ts';
import { DEFAULT_SCRYPT_LOG_N, assertPublicKey } from '../format/header.ts';

/** `pq` is the ML-KEM-768 + X25519 hybrid (`age1pq1…`, D20); `x25519` is classic age. */
export type KeyType = 'pq' | 'x25519';

export interface KeyPair {
	type: KeyType;
	publicKey: string;
	privateKey: string;
}

export async function generateKeyPair(type: KeyType = 'pq'): Promise<KeyPair> {
	const privateKey =
		type === 'pq' ? await generateHybridIdentity() : await generateX25519Identity();
	return { type, privateKey, publicKey: await identityToRecipient(privateKey) };
}

export function publicKeyType(publicKey: string): KeyType | 'other' {
	if (publicKey.startsWith('age1pq1')) return 'pq';
	if (publicKey.startsWith('age1tag') || !publicKey.startsWith('age1')) return 'other';
	return 'x25519';
}

/** Throws `invalid-public-key` with the offending key; returns the trimmed keys. */
export function validatePublicKeys(publicKeys: string[]): string[] {
	return publicKeys.map((key) => {
		const trimmed = key.trim();
		assertPublicKey(trimmed);
		return trimmed;
	});
}

/** age's guidance: mixing post-quantum and classic recipients loses PQ protection (D20). */
export function mixesPqAndClassic(publicKeys: string[]): boolean {
	const types = new Set(publicKeys.map(publicKeyType));
	return types.has('pq') && types.has('x25519');
}

/** An age identity file, as written by `age-keygen`. */
export function keyFileText(pair: KeyPair, createdAt = new Date()): string {
	return (
		`# created: ${createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z')}\n` +
		`# public key: ${pair.publicKey}\n` +
		`${pair.privateKey}\n`
	);
}

/**
 * A passphrase-protected key file: the identity file encrypted to a
 * passphrase. `age -d -i key.age` asks for the passphrase and uses it (D9).
 */
export async function protectKeyFile(
	text: string,
	passphrase: string,
	scryptLogN = DEFAULT_SCRYPT_LOG_N
): Promise<Uint8Array> {
	const encrypter = new Encrypter();
	encrypter.setScryptWorkFactor(scryptLogN);
	encrypter.setPassphrase(passphrase);
	return encrypter.encrypt(text);
}

export type KeyFileContents =
	| { protected: true }
	| { protected: false; privateKeys: string[]; publicKeys: string[] };

/**
 * Reads a key file. A protected file needs `passphrase`; without one this
 * reports `{ protected: true }` so the UI can ask for it.
 */
export async function readKeyFile(
	bytes: Uint8Array,
	passphrase?: string
): Promise<KeyFileContents> {
	let text: string;
	if (sniffBytes(bytes) === 'age') {
		if (passphrase === undefined) return { protected: true };
		const decrypter = new Decrypter();
		decrypter.addPassphrase(passphrase);
		try {
			text = await decrypter.decrypt(bytes, 'text');
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : '';
			if (message.includes('no identity matched')) {
				throw new EngineError('wrong-credentials', 'wrong passphrase for this key file', { cause });
			}
			throw new EngineError('invalid-key-file', 'this key file is damaged', { cause });
		}
	} else {
		text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
	}
	const privateKeys = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /^AGE-SECRET-KEY-(PQ-)?1[0-9A-Z]+$/.test(line));
	if (privateKeys.length === 0) {
		throw new EngineError('invalid-key-file', 'no private key found in this file');
	}
	const publicKeys = await Promise.all(
		privateKeys.map((key) =>
			identityToRecipient(key).catch((cause: unknown) => {
				throw new EngineError('invalid-key-file', 'a private key in this file is invalid', {
					cause
				});
			})
		)
	);
	return { protected: false, privateKeys, publicKeys };
}
