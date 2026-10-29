import { SW_CREDIT_WINDOW, type DownloadPortMessage } from './sw-protocol.ts';

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
