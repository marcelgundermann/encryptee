import * as vectors from 'cctv-age';
import { expect, test } from 'vite-plus/test';
import type { DecryptCredentials } from '../src/format/header.ts';
import { decrypt, sha256Hex } from './helpers.ts';

/**
 * C2SP/CCTV age test vectors, run through the full worker pipeline. Each
 * vector is `field: value` lines, a blank line, then the (maybe zlib) file.
 */
interface Vector {
	expect: string;
	payload?: string;
	identities: string[];
	passphrases: string[];
	armored: boolean;
	body: Uint8Array<ArrayBuffer>;
}

async function parse(bytes: Uint8Array): Promise<Vector> {
	let split = 0;

	while (!(bytes[split] === 10 && bytes[split + 1] === 10)) split++;

	const vector: Vector = {
		expect: '',
		identities: [],
		passphrases: [],
		armored: false,
		body: new Uint8Array()
	};

	let compressed = false;

	for (const line of new TextDecoder().decode(bytes.subarray(0, split)).split('\n')) {
		const [field, value = ''] = [
			line.slice(0, line.indexOf(': ')),
			line.slice(line.indexOf(': ') + 2)
		];

		if (field === 'expect') vector.expect = value;

		if (field === 'payload') vector.payload = value;

		if (field === 'identity') vector.identities.push(value);

		if (field === 'passphrase') vector.passphrases.push(value);

		if (field === 'armored') vector.armored = value === 'yes';

		if (field === 'compressed') compressed = true;
	}

	let body: Uint8Array<ArrayBuffer> = bytes.slice(split + 2);

	if (compressed) {
		const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate'));
		body = new Uint8Array(await new Response(stream).arrayBuffer());
	}

	vector.body = body;

	return vector;
}

const cases = Object.entries(vectors).toSorted(([a], [b]) => a.localeCompare(b));

const HEADER_FAILURE = ['corrupted', 'wrong-credentials', 'not-encrypted', 'invalid-key-file'];

/**
 * Allowed error codes, the output's SHA-256 (null: nothing delivered), and
 * whether the output may have been opened. Impossible payload sizes fail
 * before opening, other payload failures after.
 */
interface Expectation {
	codes: Array<string | null>;
	sha256: string | null;
	opened: boolean[];
}

function expectation(vector: Vector): Expectation {
	// ASCII armor is out of scope for v2: refuse it, as `armored` when the
	// armor line is intact and as `not-encrypted` when it is mangled.
	if (vector.armored) return { codes: ['armored', 'not-encrypted'], sha256: null, opened: [false] };

	switch (vector.expect) {
		case 'success':
			return { codes: [null], sha256: vector.payload ?? null, opened: [true] };
		case 'no match':
			return { codes: ['wrong-credentials'], sha256: null, opened: [false] };
		case 'HMAC failure':
		case 'header failure':
			return { codes: HEADER_FAILURE, sha256: null, opened: [false] };
		case 'payload failure':
			return { codes: ['corrupted'], sha256: null, opened: [true, false] };
		default:
			throw new Error(`unknown expectation ${vector.expect}`);
	}
}

test.each(cases)('%s', async (_, bytes) => {
	const vector = await parse(bytes);

	const credentials: DecryptCredentials =
		vector.identities.length > 0
			? { kind: 'private-keys', privateKeys: vector.identities }
			: { kind: 'passphrase', passphrase: vector.passphrases[0] ?? '' };

	const { snapshot, output } = await decrypt(vector.body, credentials, {
		workers: 1,
		batchChunks: 2,
		window: 2
	});

	const file = snapshot.files[0]!;
	const expected = expectation(vector);
	expect(expected.codes).toContain(file.error?.code ?? null);
	expect(output ? await sha256Hex(output) : null).toBe(expected.sha256);
	expect(expected.opened).toContain(file.outputSize !== null);
});
