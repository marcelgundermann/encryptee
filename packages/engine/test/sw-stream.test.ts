import { expect, test } from 'vitest';
import { SW_CREDIT_WINDOW, SW_MAX_MESSAGE_BYTES } from '../src/sinks/sw-protocol.ts';
import { SwDownloadSink, createPortStream } from '../src/sinks/sw-stream.ts';
import { sha256Hex } from './helpers.ts';

/** Both ends of one download's port: the coordinator writes, the service worker reads. */
function download() {
	const channel = new MessageChannel();

	return {
		sink: new SwDownloadSink(channel.port1),
		reader: createPortStream(channel.port2).getReader()
	};
}

async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
	const chunks: Uint8Array[] = [];

	for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value);

	return chunks;
}

function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
	let offset = 0;

	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}

	return out;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test('delivers the bytes in order, in messages no larger than Safari accepts', async () => {
	const { sink, reader } = download();
	const input = Uint8Array.from({ length: 3 * SW_MAX_MESSAGE_BYTES + 17 }, (_, i) => i % 251);
	const received = readAll(reader);
	await sink.write(input);
	await sink.close();
	const chunks = await received;

	expect(chunks.map((chunk) => chunk.length)).toEqual([
		SW_MAX_MESSAGE_BYTES,
		SW_MAX_MESSAGE_BYTES,
		SW_MAX_MESSAGE_BYTES,
		17
	]);
	expect(await sha256Hex(concat(chunks))).toBe(await sha256Hex(input));
});

test('a write waits for credit until the reader drains', async () => {
	const { sink, reader } = download();
	let written = false;

	// One message more than the credit window, so the last one has to wait.
	const write = sink
		.write(new Uint8Array((SW_CREDIT_WINDOW + 1) * SW_MAX_MESSAGE_BYTES))
		.then(() => (written = true));

	await tick();
	expect(written).toBe(false);
	await reader.read();
	await write;
});

test('cancelling the download in the browser fails the waiting write as cancelled', async () => {
	const { sink, reader } = download();
	const write = sink.write(new Uint8Array((SW_CREDIT_WINDOW + 1) * SW_MAX_MESSAGE_BYTES));
	await tick();
	await reader.cancel();
	await expect(write).rejects.toMatchObject({ code: 'cancelled' });
});

test('an abort errors the stream, so the browser fails the download', async () => {
	const { sink, reader } = download();
	await sink.abort({ code: 'corrupted', message: 'tampered' });
	await expect(reader.read()).rejects.toThrow('tampered');
});
