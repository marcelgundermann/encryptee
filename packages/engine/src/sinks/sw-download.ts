import { EngineError } from '../errors.ts';
import type { Output } from './sink.ts';
import { DOWNLOAD_ROUTE, type DownloadControlMessage } from './sw-protocol.ts';

const KEEPALIVE_MS = 10_000;

/**
 * Streams the output through the service worker's download route. The
 * coordinator writes to the sink's port; once it reports the exact output
 * size, the page registers the stream with the service worker and starts the
 * download in a hidden iframe.
 */
export function streamedOutput(name: string): Output {
	const { port1: own, port2: port } = new MessageChannel();
	const id = crypto.randomUUID();
	let iframe: HTMLIFrameElement | null = null;
	let keepalive: ReturnType<typeof setInterval> | undefined;

	const end = () => {
		clearInterval(keepalive);
		const started = iframe;

		// Removing the iframe too early can cancel the download in some browsers.
		if (started) setTimeout(() => started.remove(), 60_000);
	};

	return {
		sink: { kind: 'sw-download', port },
		transfer: [port],
		opened(size) {
			const worker = navigator.serviceWorker?.controller;

			if (!worker) throw new EngineError('save-failed', 'no service worker controls this page');

			const message: DownloadControlMessage = {
				type: 'encryptee-download',
				id,
				name,
				size,
				port: own
			};

			worker.postMessage(message, [own]);
			keepalive = setInterval(
				() =>
					navigator.serviceWorker.controller?.postMessage({
						type: 'encryptee-keepalive'
					} satisfies DownloadControlMessage),
				KEEPALIVE_MS
			);
			iframe = document.createElement('iframe');
			iframe.hidden = true;
			iframe.src = DOWNLOAD_ROUTE + id;
			document.body.append(iframe);
		},
		async finish() {
			end();

			return { kind: 'downloaded' };
		},
		release: end
	};
}
