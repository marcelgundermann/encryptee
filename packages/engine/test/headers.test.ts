import { expect, test } from 'vitest';
import { HeaderPool } from '../src/workers/headers.ts';
import type { HeaderRequest, HeaderResponse, Prepared } from '../src/workers/protocol.ts';
import { passphrase } from './helpers.ts';

const prepared: Prepared = {
	layout: {
		batchChunks: 1,
		inputOffset: 0,
		inputSize: 0,
		outputSize: 0,
		batchInputSize: 1,
		batches: 1
	},
	payloadKey: new Uint8Array(32),
	prefix: null,
	outputSize: 0
};

/** A pool of `count` header workers that answer only when told to, and the requests each got. */
function pool(count: number) {
	const channels = Array.from({ length: count }, () => new MessageChannel());
	const received: HeaderRequest[][] = channels.map(() => []);

	for (const [i, { port2 }] of channels.entries())
		port2.onmessage = ({ data }: MessageEvent<HeaderRequest>) => received[i]!.push(data);

	const headers = new HeaderPool(channels.map(({ port1 }) => port1));

	return {
		received,
		prepare: () =>
			headers.prepare(
				{ mode: 'encrypt', credentials: passphrase.encrypt },
				{ kind: 'synthetic', size: 0 },
				1
			),
		answer(worker: number, response: HeaderResponse) {
			channels[worker]!.port2.postMessage(response);
		}
	};
}

test('headers are shared between the workers, each going to the least busy', async () => {
	const { received, prepare, answer } = pool(2);
	const first = prepare();
	void prepare();
	await expect.poll(() => received.map((requests) => requests.length)).toEqual([1, 1]);

	answer(0, { type: 'prepared', request: received[0]![0]!.request, prepared });
	expect(await first).toEqual(prepared);

	void prepare();
	await expect.poll(() => received.map((requests) => requests.length)).toEqual([2, 1]);
});

test('a header that can’t be prepared rejects with its worker’s error', async () => {
	const { received, prepare, answer } = pool(1);
	const header = prepare();
	await expect.poll(() => received[0]!.length).toBe(1);

	answer(0, {
		type: 'failed',
		request: received[0]![0]!.request,
		error: { code: 'wrong-credentials', message: 'no identity matched' }
	});
	await expect(header).rejects.toMatchObject({ code: 'wrong-credentials' });
});
