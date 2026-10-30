import { describe, expect, test } from 'vite-plus/test';
import {
	generatePassphrase,
	generateKeyPair,
	keyFileText,
	mixesPqAndClassic,
	protectKeyFile,
	publicKeyType,
	readKeyFile,
	validatePublicKeys
} from '../src/index.ts';
import { TEST_LOG_N } from './helpers.ts';

describe('key pairs', () => {
	test('post-quantum hybrid by default, classic X25519 on request', async () => {
		const pq = await generateKeyPair();
		expect(pq.type).toBe('pq');
		expect(pq.publicKey).toMatch(/^age1pq1/);
		expect(pq.privateKey).toMatch(/^AGE-SECRET-KEY-PQ-1/);
		const classic = await generateKeyPair('x25519');
		expect(classic.publicKey).toMatch(/^age1/);
		expect(classic.publicKey).not.toMatch(/^age1pq1/);
		expect(publicKeyType(classic.publicKey)).toBe('x25519');
	});

	test('warns about mixing post-quantum and classic recipients', async () => {
		const [pq, classic] = await Promise.all([generateKeyPair('pq'), generateKeyPair('x25519')]);
		expect(mixesPqAndClassic([pq.publicKey])).toBe(false);
		expect(mixesPqAndClassic([pq.publicKey, classic.publicKey])).toBe(true);
	});

	test('validates pasted public keys', async () => {
		const pair = await generateKeyPair();
		expect(await validatePublicKeys([`  ${pair.publicKey}\n`])).toEqual([pair.publicKey]);
		await expect(validatePublicKeys(['age1qqqq'])).rejects.toMatchObject({
			code: 'invalid-public-key'
		});
	});
});

describe('key files', () => {
	test('plain key files use the age-keygen format', async () => {
		const pair = await generateKeyPair('x25519');
		const text = keyFileText(pair, new Date('2026-10-29T12:00:00.123Z'));
		expect(text).toBe(
			`# created: 2026-10-29T12:00:00Z\n# public key: ${pair.publicKey}\n${pair.privateKey}\n`
		);
		expect(await readKeyFile(new TextEncoder().encode(text))).toEqual({
			protected: false,
			privateKeys: [pair.privateKey],
			publicKeys: [pair.publicKey]
		});
	});

	test('protected key files need their passphrase', async () => {
		const pair = await generateKeyPair();
		const sealed = await protectKeyFile(keyFileText(pair), 'pass', TEST_LOG_N);
		expect(await readKeyFile(sealed)).toEqual({ protected: true });
		await expect(readKeyFile(sealed, 'nope')).rejects.toMatchObject({ code: 'wrong-credentials' });
		expect(await readKeyFile(sealed, 'pass')).toMatchObject({ privateKeys: [pair.privateKey] });
	});

	test('rejects files without a key', async () => {
		await expect(readKeyFile(new TextEncoder().encode('hello'))).rejects.toMatchObject({
			code: 'invalid-key-file'
		});
	});
});

describe('generated passphrases', () => {
	test('are ten hyphenated BIP39 words and differ each time', async () => {
		const { WORDS } = await import('../src/keys/wordlist.ts');
		expect(WORDS).toHaveLength(2048);
		const passphrase = generatePassphrase();
		const words = passphrase.split('-');
		expect(words).toHaveLength(10);
		expect(words.every((word) => WORDS.includes(word))).toBe(true);
		expect(generatePassphrase()).not.toBe(passphrase);
	});
});
