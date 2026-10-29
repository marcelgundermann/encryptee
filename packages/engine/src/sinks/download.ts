import { EngineError } from '../errors.ts';
import { DOWNLOAD_ROUTE, type DownloadControlMessage } from './sw-protocol.ts';

const KEEPALIVE_MS = 10_000;

/** How long a staged file's download may read from it; large files need a while. */
export const STAGED_DOWNLOAD_MS = 10 * 60_000;

/**
 * Main-thread half of a service-worker download. The coordinator gets `port`
 * in the sink descriptor; once it reports the exact output size, `begin`
 * registers the stream with the service worker and starts the download in a
 * hidden iframe.
 */
export class SwDownload {
	readonly port: MessagePort;
	private readonly own: MessagePort;
	private readonly id = crypto.randomUUID();
	private iframe: HTMLIFrameElement | null = null;
	private keepalive: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly name: string) {
		const channel = new MessageChannel();
		this.own = channel.port1;
		this.port = channel.port2;
	}

	begin(size: number): void {
		const worker = navigator.serviceWorker?.controller;

		if (!worker) throw new EngineError('save-failed', 'no service worker controls this page');

		const message: DownloadControlMessage = {
			type: 'encryptee-download',
			id: this.id,
			name: this.name,
			size,
			port: this.own
		};

		worker.postMessage(message, [this.own]);
		this.keepalive = setInterval(
			() =>
				navigator.serviceWorker.controller?.postMessage({
					type: 'encryptee-keepalive'
				} satisfies DownloadControlMessage),
			KEEPALIVE_MS
		);
		this.iframe = document.createElement('iframe');
		this.iframe.hidden = true;
		this.iframe.src = DOWNLOAD_ROUTE + this.id;
		document.body.append(this.iframe);
	}

	end(): void {
		clearInterval(this.keepalive);
		const iframe = this.iframe;

		// Removing the iframe too early can cancel the download in some browsers.
		if (iframe) setTimeout(() => iframe.remove(), 60_000);
	}
}

/** Saves the file `staged` from `directory` through a blob URL; it stays on disk, not in memory. */
export async function downloadStagedFile(
	directory: FileSystemDirectoryHandle,
	staged: string,
	name: string
): Promise<void> {
	const file = await (await directory.getFileHandle(staged)).getFile();
	const url = URL.createObjectURL(file);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), STAGED_DOWNLOAD_MS);
}
