import { expect, test } from 'vitest';
import { createPortStream } from '../src/sinks/sw-stream.ts';
import { SW_CREDIT_WINDOW, type DownloadPortMessage } from '../src/sinks/sw-protocol.ts';

/** A producer that follows the coordinator's side of the credit protocol. */
function producer(port: MessagePort) {
	let credits = 0;
	const sent: number[] = [];
	port.onmessage = ({ data }: MessageEvent<DownloadPortMessage>) => {
		if (data.type === 'credit') credits += data.credits;
	};

	return {
		get credits() {
			return credits;
		},
		sent,
		send(size: number) {
			if (credits === 0) throw new Error('sent without credit');
			credits--;
			const data = new Uint8Array(size).fill(sent.length).buffer;
			sent.push(size);
			port.postMessage({ type: 'chunk', data } satisfies DownloadPortMessage, [data]);
		},
		post(message: DownloadPortMessage) {
			port.postMessage(message);
		}
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test('streams chunks in order and grants credits as the reader drains', async () => {
	const channel = new MessageChannel();
	const stream = createPortStream(channel.port1);
	const p = producer(channel.port2);
	await tick();
	expect(p.credits).toBe(SW_CREDIT_WINDOW);

	for (let i = 0; i < SW_CREDIT_WINDOW; i++) p.send(1000 + i);
	await tick();
	expect(p.credits).toBe(0); // queue full, nothing read yet: backpressure

	const reader = stream.getReader();
	const first = await reader.read();
	expect(first.value?.length).toBe(1000);
	await tick();
	expect(p.credits).toBeGreaterThan(0);

	p.post({ type: 'end' });
	let total = first.value!.length;

	for (let r = await reader.read(); !r.done; r = await reader.read()) total += r.value.length;
	expect(total).toBe(p.sent.reduce((a, b) => a + b, 0));
});

test('an abort errors the stream so the browser fails the download', async () => {
	const channel = new MessageChannel();
	const stream = createPortStream(channel.port1);
	const p = producer(channel.port2);
	await tick();
	p.post({ type: 'abort', message: 'tampered' });
	await expect(stream.getReader().read()).rejects.toThrow('tampered');
});

test('cancelling the download tells the coordinator', async () => {
	const channel = new MessageChannel();
	const stream = createPortStream(channel.port1);
	const messages: string[] = [];
	channel.port2.onmessage = ({ data }) => messages.push(data.type);
	await tick();
	await stream.cancel();
	await tick();
	expect(messages).toContain('cancelled');
});
