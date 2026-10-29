/**
 * Both ends of a streamed download's MessagePort: the coordinator writes with
 * `SwDownloadSink`, the service worker reads with `createPortStream`. Kept
 * free of DOM- and worker-only APIs so either side, and tests, can import it.
 */
import { EngineError, type SerializedError } from '../errors.ts';
import type { ByteSink, SinkResult } from './sink.ts';
import { SW_CREDIT_WINDOW, SW_MAX_MESSAGE_BYTES, type DownloadPortMessage } from './sw-protocol.ts';

/**
 * Feeds the service worker's download stream. Each message is at most 256 KiB
 * (Safari drops larger ones) and waits for a credit from the SW, so a slow disk
 * on the download side throttles the whole pipeline.
 */
export class SwDownloadSink implements ByteSink {
	private credits = 0;
	private waiting: (() => void) | null = null;
	private cancelled = false;

	constructor(private readonly port: MessagePort) {
		port.onmessage = ({ data }: MessageEvent<DownloadPortMessage>) => {
			if (data.type === 'credit') this.credits += data.credits;

			if (data.type === 'cancelled') this.cancelled = true;
			this.waiting?.();
			this.waiting = null;
		};

		port.start();
	}

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		for (let offset = 0; offset < chunk.length; offset += SW_MAX_MESSAGE_BYTES) {
			while (this.credits === 0 && !this.cancelled) {
				await new Promise<void>((resolve) => (this.waiting = resolve));
			}

			if (this.cancelled) throw new EngineError('cancelled', 'the download was cancelled');
			this.credits--;
			const piece = chunk.slice(offset, offset + SW_MAX_MESSAGE_BYTES).buffer;
			this.post({ type: 'chunk', data: piece }, [piece]);
		}
	}

	async close(): Promise<SinkResult> {
		this.post({ type: 'end' });
		this.port.close();

		return { kind: 'saved' };
	}

	async abort(reason: SerializedError): Promise<void> {
		this.post({ type: 'abort', message: reason.message });
		this.port.close();
	}

	private post(message: DownloadPortMessage, transfer: Transferable[] = []): void {
		this.port.postMessage(message, transfer);
	}
}

/**
 * A byte stream fed by the coordinator over `port`. The stream hands out
 * credits as its queue drains, which is the backpressure for the whole job.
 */
export function createPortStream(port: MessagePort): ReadableStream<Uint8Array> {
	let outstanding = 0;

	const grant = (controller: ReadableStreamDefaultController<Uint8Array>) => {
		const wanted = (controller.desiredSize ?? 0) - outstanding;

		if (wanted <= 0) return;
		outstanding += wanted;
		port.postMessage({ type: 'credit', credits: wanted } satisfies DownloadPortMessage);
	};

	return new ReadableStream<Uint8Array>(
		{
			start(controller) {
				port.onmessage = ({ data }: MessageEvent<DownloadPortMessage>) => {
					switch (data.type) {
						case 'chunk':
							outstanding--;
							controller.enqueue(new Uint8Array(data.data));
							grant(controller);
							break;
						case 'end':
							controller.close();
							port.close();
							break;
						case 'abort':
							// Erroring the body makes the browser mark the download as failed.
							controller.error(new Error(data.message));
							port.close();
							break;
					}
				};

				port.start();
				grant(controller);
			},
			pull(controller) {
				grant(controller);
			},
			cancel() {
				port.postMessage({ type: 'cancelled' } satisfies DownloadPortMessage);
				port.close();
			}
		},
		{ highWaterMark: SW_CREDIT_WINDOW }
	);
}
