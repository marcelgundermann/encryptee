import { describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { keyFileText } from '../src/keys/key-pair.ts';
import { generateKeyPair, protectKeyFile, readKeyFile } from '../src/index.ts';
import {
	CHUNK,
	TEST_LOG_N,
	decrypt,
	encrypt,
	equalBytes,
	fromBase64,
	randomBytes,
	toBase64
} from './helpers.ts';

/** Interop with the reference `age` CLI (≥ 1.3) via Vitest browser commands. */
const available = await commands.ageAvailable();
if (!available) console.warn('age CLI not found; set AGE_BIN to run interop tests');

describe.runIf(available)('age CLI interop', () => {
	const plain = randomBytes(3 * CHUNK + 123);

	test.each(['pq', 'x25519'] as const)(
		'`age -d` opens files the engine encrypted to a %s key',
		async (type) => {
			const pair = await generateKeyPair(type);
			const sealed = await encrypt(plain, { kind: 'public-keys', publicKeys: [pair.publicKey] });
			const result = await commands.ageDecrypt({
				input: toBase64(sealed),
				identity: keyFileText(pair)
			});
			expect(result.ok ? equalBytes(fromBase64(result.output), plain) : result.error).toBe(true);
		}
	);

	test('`age -d -j batchpass` opens passphrase files the engine encrypted', async () => {
		const sealed = await encrypt(plain, {
			kind: 'passphrase',
			passphrase: 'interop',
			scryptLogN: TEST_LOG_N
		});
		const result = await commands.ageDecrypt({ input: toBase64(sealed), passphrase: 'interop' });
		expect(result.ok ? equalBytes(fromBase64(result.output), plain) : result.error).toBe(true);
	});

	test.each([true, false])('the engine opens files `age` encrypted (pq: %s)', async (pq) => {
		const pair = await commands.ageKeygen(pq);
		const sealed = fromBase64(
			await commands.ageEncrypt({ input: toBase64(plain), recipients: [pair.publicKey] })
		);
		const { output } = await decrypt(sealed, {
			kind: 'private-keys',
			privateKeys: [pair.privateKey]
		});
		expect(equalBytes(output!, plain)).toBe(true);
	});

	test('the engine opens passphrase files `age` encrypted', async () => {
		const sealed = fromBase64(
			await commands.ageEncrypt({ input: toBase64(plain), passphrase: 'from-cli' })
		);
		const { output } = await decrypt(sealed, { kind: 'passphrase', passphrase: 'from-cli' });
		expect(equalBytes(output!, plain)).toBe(true);
	});

	test('protected key files are age passphrase files holding an identity', async () => {
		// `age -d -i key.age` prompts on a TTY; decrypting the key file with
		// batchpass and then using it is the same check, non-interactively.
		const pair = await generateKeyPair('pq');
		const protectedFile = await protectKeyFile(keyFileText(pair), 'key-pass', TEST_LOG_N);
		const opened = await commands.ageDecrypt({
			input: toBase64(protectedFile),
			passphrase: 'key-pass'
		});
		expect(opened.ok).toBe(true);
		const identity = new TextDecoder().decode(fromBase64((opened as { output: string }).output));
		const sealed = await encrypt(plain, { kind: 'public-keys', publicKeys: [pair.publicKey] });
		const result = await commands.ageDecrypt({ input: toBase64(sealed), identity });
		expect(result.ok).toBe(true);
		expect(await readKeyFile(protectedFile, 'key-pass')).toMatchObject({
			privateKeys: [pair.privateKey]
		});
	});
});
