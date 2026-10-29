import { describe, expect, test } from 'vitest';
import {
	SEALED_CHUNK_SIZE,
	TAG_SIZE,
	headerLength,
	openedPayloadSize,
	sealedPayloadSize,
	sniffBytes,
	stanzaTypes
} from '../src/format/age.ts';
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
		'rejects impossible sealed size %i',
		(size) => {
			expect(() => openedPayloadSize(size)).toThrow(/payload/);
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
		['encryptee.io\x00\x01', 'legacy'],
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
