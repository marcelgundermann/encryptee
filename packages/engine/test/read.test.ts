import { expect, test } from 'vitest';
import { readBlob } from '../src/read.ts';
import { randomBytes } from './helpers.ts';

/** A Blob whose reads give `bytes`, or fail, whatever its size says, like a file changed on disk. */
function changedBlob(size: number, read: () => Promise<ArrayBuffer>): Blob {
	const blob = new Blob([randomBytes(size)]);
	blob.slice = () => Object.assign(new Blob(), { arrayBuffer: read });

	return blob;
}

test('a read gives the bytes asked for', async () => {
	const bytes = randomBytes(100);
	const read = readBlob(new Blob([bytes]));

	expect(new Uint8Array(await read(10, 30))).toEqual(bytes.slice(10, 30));
});

test('a read shorter than the file was fails as read-failed', async () => {
	const read = readBlob(changedBlob(100, async () => new ArrayBuffer(50)));

	await expect(read(0, 100)).rejects.toMatchObject({ code: 'read-failed' });
});

test('a read the browser refuses fails as read-failed', async () => {
	const gone = changedBlob(100, async () => {
		throw new DOMException('gone', 'NotReadableError');
	});

	await expect(readBlob(gone)(0, 100)).rejects.toMatchObject({ code: 'read-failed' });
});
