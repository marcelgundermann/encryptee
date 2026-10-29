import { EngineError } from '../errors.ts';
import { OPFS_STAGING_DIR } from './sink.ts';
import { DOWNLOAD_ROUTE, type DownloadControlMessage } from './sw-protocol.ts';

const KEEPALIVE_MS = 10_000;

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

		if (!worker) throw new EngineError('unsupported', 'no service worker controls this page');

		const message: DownloadControlMessage = {
			type: 'encryptee-download',
			id: this.id,
			name: this.name,
			size,
			port: this.own
		};

		worker.postMessage(message, [this.own]);
		this.keepalive = setInterval(
			() => navigator.serviceWorker.controller?.postMessage({ type: 'encryptee-keepalive' }),
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

/** Saves a staged OPFS file through a blob URL; the File stays on disk, not in memory. */
export async function downloadStagedFile(path: string[], name: string): Promise<void> {
	const root = await navigator.storage.getDirectory();
	let directory = root;

	for (const segment of path.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
	const handle = await directory.getFileHandle(path.at(-1)!);
	const file = await handle.getFile();
	const url = URL.createObjectURL(file);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	// The download reads from the blob URL; keep it valid long enough for large files.
	setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
}

/**
 * Deletes files staged in OPFS by earlier sessions. Call on startup, never
 * while a staged download may still be reading.
 */
export async function clearStagingArea(): Promise<void> {
	if (typeof navigator.storage?.getDirectory !== 'function') return;
	const root = await navigator.storage.getDirectory();
	await root.removeEntry(OPFS_STAGING_DIR, { recursive: true }).catch(() => {});
}
