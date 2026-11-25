/**
 * Both ends of a streamed download's MessagePort: the coordinator writes with
 * `SwDownloadSink`, the service worker reads with `createPortStream`. Kept
 * free of DOM- and worker-only APIs so either side, and tests, can import it.
 */
import { EngineError, type SerializedError } from '../errors.ts';
import type { ByteSink, SinkResult } from './sink.ts';
import { SW_CREDIT_WINDOW, SW_MAX_MESSAGE_BYTES, type DownloadPortMessage } from './sw-protocol.ts';

/** How long the browser may take to fetch a download the page started. */
const START_MS = 30_000;

/** Where a streamed download stands, as the coordinator sees it. */
type Download =
	/** The browser hasn't fetched it, so the service worker has granted no credit. */
	| { status: 'starting' }
	| { status: 'streaming'; credits: number }
	/** The browser has read all of it. */
	| { status: 'taken' }
	/** The user cancelled it in the browser, or the browser never fetched it. */
	| { status: 'failed'; error: EngineError };

/**
 * Feeds the service worker's download stream. Each message stays within
 * `SW_MAX_MESSAGE_BYTES` and waits for a credit from the SW, so a slow disk
 * on the download side throttles the whole pipeline.
 */
export class SwDownloadSink implements ByteSink {
	private download: Download = { status: 'starting' };
	private wake: (() => void) | null = null;
	private readonly startTimer: ReturnType<typeof setTimeout>;

	/** Fails the download if the browser hasn't fetched it within `startWithin` ms. */
	constructor(
		private readonly port: MessagePort,
		startWithin = START_MS
	) {
		this.startTimer = setTimeout(() => {
			if (this.download.status === 'starting')
				this.move({
					status: 'failed',
					error: new EngineError('save-failed', 'the browser never fetched the download')
				});
		}, startWithin);

		port.onmessage = ({ data }: MessageEvent<DownloadPortMessage>) => this.receive(data);
		port.start();
	}

	async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
		for (let offset = 0; offset < chunk.length; offset += SW_MAX_MESSAGE_BYTES) {
			await this.spendCredit();
			const piece = chunk.slice(offset, offset + SW_MAX_MESSAGE_BYTES).buffer;
			this.post({ type: 'chunk', data: piece }, [piece]);
		}
	}

	async drain(): Promise<void> {
		this.post({ type: 'end' });

		while (this.download.status !== 'taken') {
			if (this.download.status === 'failed') throw this.download.error;
			await this.change();
		}
	}

	async close(): Promise<SinkResult> {
		this.end();

		return { kind: 'saved' };
	}

	async abort(reason: SerializedError): Promise<void> {
		this.post({ type: 'abort', message: reason.message });
		this.end();
	}

	/** Resolves once the service worker has granted a credit, which it spends. */
	private async spendCredit(): Promise<void> {
		for (;;) {
			const { download } = this;

			if (download.status === 'failed') throw download.error;

			if (download.status === 'taken')
				throw new EngineError('internal', 'a write after the download ended');

			if (download.status === 'streaming' && download.credits > 0) {
				download.credits--;

				return;
			}

			await this.change();
		}
	}

	private receive(message: DownloadPortMessage): void {
		const { download } = this;

		if (download.status === 'taken' || download.status === 'failed') return;

		if (message.type === 'credit') {
			const credits = download.status === 'streaming' ? download.credits : 0;
			this.move({ status: 'streaming', credits: credits + message.credits });
		} else if (message.type === 'taken') {
			this.move({ status: 'taken' });
		} else if (message.type === 'cancelled') {
			const error = new EngineError('cancelled', 'the download was cancelled');
			this.move({ status: 'failed', error });
		}
	}

	private move(next: Download): void {
		this.download = next;
		this.wake?.();
		this.wake = null;
	}

	/** Resolves when the download moves. */
	private change(): Promise<void> {
		return new Promise((resolve) => (this.wake = resolve));
	}

	private end(): void {
		clearTimeout(this.startTimer);
		this.port.close();
	}

	private post(message: DownloadPortMessage, transfer: Transferable[] = []): void {
		this.port.postMessage(message, transfer);
	}
}

/**
 * A byte stream fed by the coordinator over `port`. The stream hands out
 * credits as its queue drains, which is the backpressure for the whole job.
 * After the last chunk it ends once its queue is empty, and only then tells
 * the coordinator that the browser has taken the download.
 */
export function createPortStream(port: MessagePort): ReadableStream<Uint8Array> {
	let outstanding = 0;
	let ended = false;

	/** Grants the credit the queue has room for, or ends the stream after its last chunk was read. */
	const step = (controller: ReadableStreamDefaultController<Uint8Array>) => {
		const room = controller.desiredSize ?? 0;

		if (ended) {
			if (room < SW_CREDIT_WINDOW) return;
			controller.close();
			port.postMessage({ type: 'taken' } satisfies DownloadPortMessage);
			port.close();

			return;
		}

		const wanted = room - outstanding;

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
							step(controller);
							break;
						case 'end':
							ended = true;
							step(controller);
							break;
						case 'abort':
							// Erroring the body makes the browser mark the download as failed.
							controller.error(new Error(data.message));
							port.close();
							break;
					}
				};

				port.start();
				step(controller);
			},
			pull: step,
			cancel() {
				port.postMessage({ type: 'cancelled' } satisfies DownloadPortMessage);
				port.close();
			}
		},
		{ highWaterMark: SW_CREDIT_WINDOW }
	);
}
