/// <reference lib="webworker" />
import { handleDownloadFetch, handleDownloadMessage } from '@encryptee/engine/sw';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// The download route must see fetches before the precache router does.
self.addEventListener('fetch', (event) => {
	handleDownloadFetch(event);
});

self.addEventListener('message', (event) => {
	if (handleDownloadMessage(event)) return;

	// Sent by the page only when the user accepts an update and no job runs.
	if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Take control on first install so the first visit can already stream
// downloads. Later versions only activate after the user accepts an update.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST, { cleanURLs: true, directoryIndex: 'index.html' });
