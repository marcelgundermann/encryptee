/** Path prefix the service worker answers with a streaming download. */
export const DOWNLOAD_ROUTE = '/__download/';

/** Safari drops postMessage payloads above this size (field reports, 2026). */
export const SW_MAX_MESSAGE_BYTES = 256 * 1024;

/** How many messages the SW lets the coordinator send ahead (4 MiB). */
export const SW_CREDIT_WINDOW = 16;

/** Page → service worker, on `navigator.serviceWorker.controller`. */
export type DownloadControlMessage =
	| {
			type: 'encryptee-download';
			id: string;
			name: string;
			size: number;
			port: MessagePort;
	  }
	/** Sent every few seconds during a download: each event resets the SW's idle timer. */
	| { type: 'encryptee-keepalive' };

/** Coordinator ⇄ service worker, on the download's MessagePort. */
export type DownloadPortMessage =
	| { type: 'chunk'; data: ArrayBuffer }
	| { type: 'end' }
	| { type: 'abort'; message: string }
	| { type: 'credit'; credits: number }
	/** The user cancelled the download in the browser UI. */
	| { type: 'cancelled' };
