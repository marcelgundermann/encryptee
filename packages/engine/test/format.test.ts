import { describe, expect, test } from 'vite-plus/test';
import {
	SEALED_CHUNK_SIZE,
	TAG_SIZE,
	headerLength,
	openedPayloadSize,
	sealedPayloadSize,
	sniffBytes,
	stanzaTypes
} from '../src/format/age.ts';
import { numberedName, outputName } from '../src/format/names.ts';
import { writeChunkNonce } from '../src/payload/cipher.ts';
import { CHUNK } from './helpers.ts';

const encode = (text: string) => new TextEncoder().encode(text);

describe('payload sizes', () => {
	test.each([0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK, 3 * CHUNK + 1, 1e9])(
		'sealed and opened sizes round-trip for %i bytes',
		(size) => {
			expect(openedPayloadSize(sealedPayloadSize(size))).toBe(size);
		}
	);

	test('an empty file has one tag-only chunk', () => {
		expect(sealedPayloadSize(0)).toBe(TAG_SIZE);
	});

	test.each([0, 15, SEALED_CHUNK_SIZE + 1, SEALED_CHUNK_SIZE + TAG_SIZE])(
		'an impossible sealed size, %i, is corrupted',
		(size) => {
			expect(() => openedPayloadSize(size)).toThrow(expect.objectContaining({ code: 'corrupted' }));
		}
	);
});

describe('header parsing', () => {
	const header = 'age-encryption.org/v1\n-> X25519 abc\nYWJj\n--- 0123456789abcdef\n';

	test('finds the end of the header', () => {
		expect(headerLength(encode(header + 'payload'))).toBe(header.length);
	});

	test('reports an incomplete header', () => {
		expect(headerLength(encode(header.slice(0, -1)))).toBeNull();
		expect(headerLength(encode('age-encryption.org/v1\n-> X25519 abc\n'))).toBeNull();
	});

	test('lists stanza types', () => {
		expect(stanzaTypes(encode(header))).toEqual(['X25519']);
	});
});

describe('sniffing', () => {
	test.each([
		['age-encryption.org/v1\n-> scrypt', 'age'],
		['-----BEGIN AGE ENCRYPTED FILE-----\n', 'age-armored'],
		['%PDF-1.7', 'plain'],
		['', 'plain']
	])('%j is %s', (head, kind) => {
		expect(sniffBytes(encode(head))).toBe(kind);
	});
});

describe('chunk nonce', () => {
	test('is BE88(index) ‖ lastFlag', () => {
		expect(Array.from(writeChunkNonce(new Uint8Array(12), 1, false))).toEqual([
			0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0
		]);
		expect(Array.from(writeChunkNonce(new Uint8Array(12), 2 ** 40 + 258, true))).toEqual([
			0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 2, 1
		]);
	});
});

describe('output names', () => {
	test.each([
		['encrypt', 'notes.txt', 'notes.txt.age'],
		['decrypt', 'notes.txt.age', 'notes.txt'],
		['decrypt', 'notes.txt.AGE', 'notes.txt'],
		['decrypt', 'notes.txt', 'notes.txt.decrypted'],
		['decrypt', '.age', '.age.decrypted']
	] as const)('%s turns %s into %s', (mode, name, output) => {
		expect(outputName(mode, name)).toBe(output);
	});

	test.each([
		['photo.jpg', 'photo (1).jpg'],
		['photo.jpg.age', 'photo (1).jpg.age'],
		['README', 'README (1)'],
		['README.age', 'README (1).age'],
		['.bashrc', '.bashrc (1)'],
		['.age', '.age (1)']
	])('the first numbered name for %s is %s', (name, numbered) => {
		expect(numberedName(name, 1)).toBe(numbered);
	});
});
