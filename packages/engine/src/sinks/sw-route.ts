/**
 * Service-worker side of the streaming download sink. The app's `sw.ts` wires
 * `handleDownloadMessage` and `handleDownloadFetch` into its listeners. The
 * service worker never runs crypto; it only relays bytes from the coordinator
 * into a streaming `Response` (see docs/research/2026-10-browser-io-50gb.md).
 */
import { DOWNLOAD_ROUTE, type DownloadControlMessage } from './sw-protocol.ts';
import { createPortStream } from './sw-stream.ts';

interface PendingDownload {
	name: string;
	size: number;
	stream: ReadableStream<Uint8Array>;
}

const downloads = new Map<string, PendingDownload>();
const arrivals = new Map<string, () => void>();

/** Returns true if the message was a download control message. */
export function handleDownloadMessage(event: ExtendableMessageEvent): boolean {
	const data = event.data as DownloadControlMessage | undefined;

	if (data?.type === 'encryptee-keepalive') return true;

	if (data?.type !== 'encryptee-download') return false;
	downloads.set(data.id, {
		name: data.name,
		size: data.size,
		stream: createPortStream(data.port)
	});
	arrivals.get(data.id)?.();

	return true;
}

/** Returns true if the fetch was for the download route and has been answered. */
export function handleDownloadFetch(event: FetchEvent): boolean {
	const url = new URL(event.request.url);

	if (url.origin !== location.origin || !url.pathname.startsWith(DOWNLOAD_ROUTE)) return false;
	const id = url.pathname.slice(DOWNLOAD_ROUTE.length);
	const download = downloads.get(id);

	if (download) {
		// Resolve respondWith immediately: iPadOS kills a pending one after ~70 s.
		event.respondWith(downloadResponse(id, download));
	} else {
		// The control message may still be in flight; wait briefly for it.
		event.respondWith(
			new Promise<Response>((resolve) => {
				const timer = setTimeout(() => {
					arrivals.delete(id);
					resolve(new Response('Download not found', { status: 404 }));
				}, 5000);

				arrivals.set(id, () => {
					clearTimeout(timer);
					arrivals.delete(id);
					resolve(downloadResponse(id, downloads.get(id)!));
				});
			})
		);
	}

	return true;
}

function downloadResponse(id: string, download: PendingDownload): Response {
	downloads.delete(id);

	return new Response(download.stream, {
		headers: {
			'Content-Type': 'application/octet-stream',
			// Exact length: iOS truncates downloads without one.
			'Content-Length': String(download.size),
			'Content-Disposition': contentDisposition(download.name),
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

function contentDisposition(name: string): string {
	const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');

	return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
